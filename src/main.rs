use chrono::Utc;
use opencv::dnn::read_net_from_onnx;
use opencv::{
    core::get_cuda_enabled_device_count, core::Mat, core::Scalar, core::Size, core::Vector,
    core::CV_32F, dnn::blob_from_image, dnn::read_net, dnn::Net, dnn::DNN_BACKEND_CUDA,
    dnn::DNN_TARGET_CUDA, highgui::imshow, highgui::named_window, highgui::resize_window,
    highgui::wait_key, imgcodecs::imencode, imgproc::resize, prelude::*, videoio::get_backends,
    videoio::VideoCapture,
};

mod lib;
use lib::data_storage::new_datastorage;
use lib::detection::process_yolo_detections;
use lib::draw;
use lib::tracker::{SpatialInfo, Tracker};
use lib::zones::Zone;

mod settings;
use settings::AppSettings;

mod video_capture;
use video_capture::{get_video_capture, ThreadedFrame};

use lib::publisher::RedisConnection;

use lib::rest_api;

use ctrlc;
use std::env;
use std::error;
use std::error::Error;
use std::fmt;
use std::io::Write;
use std::process;
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::Duration as STDDuration;
use std::time::Instant;
use std::time::SystemTime;

use crate::lib::spatial::lonlat_to_meters;
use crate::lib::spatial::meters_to_lonlat;
use crate::lib::{data_storage, zones};

const VIDEOCAPTURE_POS_MSEC: i32 = 0;
const COCO_FILTERED_CLASSNAMES: &'static [&'static str] =
    &["car", "motorbike", "bus", "train", "truck"];
const BLOB_SCALE: f64 = 1.0 / 255.0;
const BLOB_NAME: &'static str = "";
const EMPTY_FRAMES_LIMIT: u16 = 60;

fn get_sys_time_in_secs() -> u64 {
    match SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
        Ok(n) => n.as_secs(),
        Err(_) => panic!("SystemTime before UNIX EPOCH!"),
    }
}

#[derive(Debug)]
struct AppVideoError {
    typ: i16,
}
impl fmt::Display for AppVideoError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self.typ {
            1 => write!(f, "Can't open video"),
            2 => write!(f, "Can't make probe for video"),
            _ => write!(f, "Undefined application video error"),
        }
    }
}

#[derive(Debug)]
enum AppError {
    VideoError(AppVideoError),
    OpenCVError(opencv::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::VideoError(e) => write!(f, "{}", e),
            AppError::OpenCVError(e) => write!(f, "{}", e),
        }
    }
}

impl From<AppVideoError> for AppError {
    fn from(e: AppVideoError) -> Self {
        AppError::VideoError(e)
    }
}

impl From<opencv::Error> for AppError {
    fn from(e: opencv::Error) -> Self {
        AppError::OpenCVError(e)
    }
}

fn probe_video(capture: &mut VideoCapture) -> Result<(f32, f32, f32), AppError> {
    let fps = capture.get(opencv::videoio::CAP_PROP_FPS)? as f32;
    let frame_cols = capture.get(opencv::videoio::CAP_PROP_FRAME_WIDTH)? as f32;
    let frame_rows = capture.get(opencv::videoio::CAP_PROP_FRAME_HEIGHT)? as f32;

    // Is it better to get width/height from frame information?
    // let mut frame = Mat::default();
    // match capture.read(&mut frame) {
    //     Ok(_) => {},
    //     Err(_) => {
    //         return Err(AppError::VideoError(AppVideoError{typ: 2}));
    //     }
    // };
    // let frame_cols = frame.cols() as f32;
    // let frame_rows = frame.rows() as f32;
    return Ok((frame_cols, frame_rows, fps));
}

fn prepare_neural_net(model: &str) -> Result<(Net, Vector<String>), AppError> {
    let mut neural_net = read_net_from_onnx(model)?;

    let out_layers_names = neural_net.get_unconnected_out_layers_names()?;

    /* Check if CUDA is an option at all */
    let cuda_count = get_cuda_enabled_device_count()?;
    let cuda_available = cuda_count > 0;
    println!(
        "CUDA is {}",
        if cuda_available {
            "'available'"
        } else {
            "'not available'"
        }
    );

    // Initialize CUDA back-end if possible
    if cuda_available {
        match neural_net.set_preferable_backend(DNN_BACKEND_CUDA) {
            Ok(_) => {}
            Err(err) => {
                panic!(
                    "Can't set DNN_BACKEND_CUDA for neural network due the error {:?}",
                    err
                );
            }
        }
        match neural_net.set_preferable_target(DNN_TARGET_CUDA) {
            Ok(_) => {}
            Err(err) => {
                panic!(
                    "Can't set DNN_TARGET_CUDA for neural network due the error {:?}",
                    err
                );
            }
        }
    }

    Ok((neural_net, out_layers_names))
}

fn run(
    settings: &AppSettings,
    path_to_config: &str,
    tracker: &mut Tracker,
    neural_net: &mut Net,
    neural_net_out_layers: Vector<String>,
    verbose: bool,
) -> Result<(), AppError> {
    println!("Verbose is '{}'", verbose);
    println!("REST API is '{}'", settings.rest_api.enable);
    println!("Redis publisher is '{}'", settings.redis_publisher.enable);

    let enable_mjpeg = match &settings.rest_api.mjpeg_streaming {
        Some(v) => v.enable & settings.rest_api.enable, // Logical 'And' to prevent MJPEG when API is disabled
        None => false,
    };

    println!("MJPEG is '{}'", enable_mjpeg);

    /* Preprocess spatial data */
    let data_storage = new_datastorage(settings.equipment_info.id.clone(), verbose);

    let scale_x = match settings.input.scale_x {
        Some(x) => x,
        None => 1.0,
    };
    let scale_y = match settings.input.scale_y {
        Some(y) => y,
        None => 1.0,
    };
    for road_lane in settings.road_lanes.iter() {
        let mut polygon = Zone::from(road_lane);
        polygon.scale_geom(scale_x, scale_y);
        polygon.set_target_classes(COCO_FILTERED_CLASSNAMES);
        match data_storage.write().unwrap().insert_zone(polygon) {
            Ok(_) => {}
            Err(err) => {
                panic!("Can't insert zone due the error {:?}", err);
            }
        };
    }

    // let data_storage_threaded = data_storage.clone();

    println!("Press `Ctrl-C` to stop main programm");
    ctrlc::set_handler(move || {
        println!("Ctrl+C has been pressed! Exit in 2 seconds");
        thread::sleep(STDDuration::from_secs(2));
        process::exit(1);
    })
    .expect("Error setting `Ctrl-C` handler");

    /* Start statistics ("threading" is obsolete because of business-logic error) */
    let reset_time = settings.worker.reset_data_milliseconds;
    let next_reset = reset_time as f32 / 1000.0;
    let ds_worker = data_storage.clone();

    /* Redis publisher */
    let redis_enabled = settings.redis_publisher.enable;
    let redis_worker = data_storage.clone();
    let redis_conn = match redis_enabled {
        true => {
            let redis_host = settings.redis_publisher.host.to_owned();
            let redis_port = settings.redis_publisher.port;
            let redis_password = settings.redis_publisher.password.to_owned();
            let redis_db_index = settings.redis_publisher.db_index;
            let redis_channel = settings.redis_publisher.channel_name.to_owned();
            let mut redis_conn = match redis_password.chars().count() {
                0 => RedisConnection::new(redis_host, redis_port, redis_db_index, redis_worker),
                _ => RedisConnection::new_with_password(
                    redis_host,
                    redis_port,
                    redis_db_index,
                    redis_password,
                    redis_worker,
                ),
            };
            if redis_channel.chars().count() != 0 {
                redis_conn.set_channel(redis_channel);
            }
            Some(redis_conn)
        }
        false => None,
    };

    /* Start REST API if needed */
    let overwrite_file = path_to_config.to_string();
    let (tx_mjpeg, rx_mjpeg) = mpsc::sync_channel(0);
    if settings.rest_api.enable {
        let settings_clone = settings.clone();
        let ds_api = data_storage.clone();
        thread::spawn(move || {
            match rest_api::start_rest_api(
                settings_clone.rest_api.host.clone(),
                settings_clone.rest_api.back_end_port,
                ds_api,
                enable_mjpeg,
                rx_mjpeg,
                settings_clone,
                &overwrite_file,
            ) {
                Ok(_) => {}
                Err(err) => {
                    println!("Can't start API due the error: {:?}", err)
                }
            }
        });
    }

    /* Probe video */
    let mut video_capture =
        get_video_capture(&settings.input.video_src, settings.input.typ.clone());
    let opened = VideoCapture::is_opened(&video_capture).map_err(|err| AppError::from(err))?;
    if !opened {
        return Err(AppError::VideoError(AppVideoError { typ: 1 }));
    }
    let (width, height, fps) = probe_video(&mut video_capture)?;
    println!("Video probe: {{Width: {width}px | Height: {height}px | FPS: {fps}}}");
    // Create imshow() if needed
    let window = &settings.output.window_name;
    let output_width: i32 = settings.output.width;
    let output_height: i32 = settings.output.height;
    if settings.output.enable {
        match named_window(window, 1) {
            Ok(_) => {}
            Err(err) => {
                panic!(
                    "Can't give a name to output window due the error: {:?}",
                    err
                )
            }
        };
        match resize_window(window, output_width, output_height) {
            Ok(_) => {}
            Err(err) => {
                panic!("Can't resize output window due the error: {:?}", err)
            }
        }
    }

    /* Start capture loop */
    let (tx_capture, rx_capture): (
        mpsc::SyncSender<ThreadedFrame>,
        mpsc::Receiver<ThreadedFrame>,
    ) = mpsc::sync_channel(0);
    thread::spawn(move || {
        let mut frames_counter: f32 = 0.0;
        let mut total_seconds: f32 = 0.0;
        let mut empty_frames_countrer: u16 = 0;
        // @experimental
        let skip_every_n_frame = 2;
        // @todo: remove hardcode
        // let fps = 18.0;
        loop {
            let mut read_frame = Mat::default();
            match video_capture.read(&mut read_frame) {
                Ok(_) => {}
                Err(_) => {
                    println!("Can't read next frame");
                    break;
                }
            };
            if read_frame.empty() {
                if verbose {
                    println!("[WARNING]: Empty frame");
                }
                empty_frames_countrer += 1;
                if empty_frames_countrer >= EMPTY_FRAMES_LIMIT {
                    println!("Too many empty frames");
                    break;
                }
                continue;
            }
            frames_counter += 1.0;
            let second_fraction = total_seconds + (frames_counter / fps);
            if frames_counter >= fps {
                total_seconds += 1.0;
                frames_counter = 0.0;
            }
            if frames_counter as i32 % skip_every_n_frame != 0 {
                continue;
            }
            // println!("Frame {frames_counter} | Second: {total_seconds} | Fraction: {second_fraction}");

            /* Send frame and capture info */
            let frame = ThreadedFrame {
                frame: read_frame,
                current_second: second_fraction,
            };

            match tx_capture.send(frame) {
                Ok(_) => {}
                Err(_err) => {
                    // Closed channel?
                    // println!("Error on send frame to detection thread: {}", _err)
                }
            };

            // println!("Total seconds: {}", total_seconds);
            if total_seconds >= next_reset {
                println!(
                    "Reset timer due analytics. Current local time is: {}",
                    second_fraction
                );
                total_seconds = 0.0;
                let mut ds_writer = ds_worker.write().expect("Bad DS");
                if ds_writer.period_end == ds_writer.period_start {
                    // First iteration
                    ds_writer.period_end = Utc::now();
                    ds_writer.period_start =
                        ds_writer.period_end - chrono::Duration::milliseconds(reset_time);
                } else {
                    // Next iterations
                    ds_writer.period_start = ds_writer.period_end;
                    ds_writer.period_end =
                        ds_writer.period_end + chrono::Duration::milliseconds(reset_time);
                }

                match ds_writer.update_statistics() {
                    Ok(_) => {
                        // Do not forget to drop mutex explicitly since we possible need to work with DS in REST API and Redis
                        drop(ds_writer)
                    }
                    Err(err) => {
                        println!("Can't update statistics due the error: {}", err);
                    }
                }
                if redis_enabled {
                    redis_conn.as_ref().unwrap().push_statistics();
                }
            }
        }
        match video_capture.release() {
            Ok(_) => {
                println!("Video capture has been closed successfully");
            }
            Err(err) => {
                println!("Can't release video capturer due the error: {}", err);
            }
        };
    });

    /* Detection thread */
    let net_size = Size::new(settings.detection.net_width, settings.detection.net_height);
    let blob_mean: Scalar = Scalar::new(0.0, 0.0, 0.0, 0.0);
    let mut detections = Vector::<Mat>::new();
    let conf_threshold: f32 = settings.detection.conf_threshold;
    let nms_threshold: f32 = settings.detection.nms_threshold;
    let coco_classnames = &settings.detection.net_classes;
    let max_points_in_track: usize = settings.tracking.max_points_in_track;
    let mut resized_frame = Mat::default();

    let ds_tracker = data_storage.clone();

    let tracker_dt = (1.0 / fps) as f32;

    /* Can't create colors as const/static currently */
    let trajectory_scalar: Scalar = Scalar::from((0.0, 255.0, 0.0));
    let trajectory_scalar_inverse: Scalar = draw::invert_color(&trajectory_scalar);
    let bbox_scalar: Scalar = Scalar::from((0.0, 255.0, 0.0));
    let bbox_scalar_inverse: Scalar = draw::invert_color(&bbox_scalar);
    let id_scalar: Scalar = Scalar::from((0.0, 255.0, 0.0));
    let id_scalar_inverse: Scalar = draw::invert_color(&id_scalar);
    for received in rx_capture {
        // println!("Received frame from capture thread: {}", received.current_second);
        let mut frame = received.frame.clone();
        let blobimg =
            blob_from_image(&frame, BLOB_SCALE, net_size, blob_mean, true, false, CV_32F)?;
        match neural_net.set_input(&blobimg, BLOB_NAME, 1.0, blob_mean) {
            Ok(_) => {}
            Err(err) => {
                println!("Can't set input of neural network due the error {:?}", err);
                continue;
            }
        };

        match neural_net.forward(&mut detections, &neural_net_out_layers) {
            Ok(_) => {}
            Err(err) => {
                println!(
                    "Can't process input of neural network due the error {:?}",
                    err
                );
                continue;
            }
        }

        /* Process detected objects and match them to existing ones */
        let mut tmp_detections = process_yolo_detections(
            &detections,
            conf_threshold,
            nms_threshold,
            width,
            height,
            max_points_in_track,
            &coco_classnames,
            COCO_FILTERED_CLASSNAMES,
            tracker_dt,
        );

        match tracker.match_objects(&mut tmp_detections, received.current_second) {
            Ok(_) => {}
            Err(err) => {
                println!("Can't match objects due the error: {:?}", err);
                continue;
            }
        };

        let ds_guard = ds_tracker.read().expect("DataStorage is poisoned [RWLock]");
        let zones = ds_guard
            .zones
            .read()
            .expect("Spatial data is poisoned [RWLock]");

        // Reset current occupancy for zones
        let current_ut = get_sys_time_in_secs();
        for (_, zone_guarded) in zones.iter() {
            let mut zone = zone_guarded.lock().expect("Zone is poisoned [Mutex]");
            zone.current_statistics.occupancy = 0;
            zone.current_statistics.last_time = current_ut;
            drop(zone);
        }

        for (object_id, object_extra) in tracker.objects_extra.iter_mut() {
            let object = tracker.engine.objects.get(object_id).unwrap();
            if object.get_no_match_times() > 1 {
                // Skip, since object is lost for a while
                // println!("Object {} is lost for a while", object_id);
                continue;
            }

            let times = &object_extra.times;
            let last_time = times[times.len() - 1];

            let track: &Vec<mot_rs::utils::Point> = object.get_track();
            let last_point = &track[track.len() - 1];

            // Check if object is inside of any polygon
            for (_, zone_guarded) in zones.iter() {
                let mut zone = zone_guarded.lock().expect("Zone is poisoned [Mutex]");
                if !zone.contains_point(last_point.x, last_point.y) {
                    continue;
                }
                zone.current_statistics.occupancy += 1; // Increment current load to match number of objects in zone
                let projected_pt = zone.project_to_skeleton(last_point.x, last_point.y);
                let pixels_per_meters = zone.get_skeleton_ppm();
                match object_extra.spatial_info {
                    Some(ref mut spatial_info) => {
                        spatial_info.update_avg(
                            last_time,
                            last_point.x,
                            last_point.y,
                            projected_pt.0,
                            projected_pt.1,
                            pixels_per_meters,
                        );
                        zone.register_or_update_object(
                            object_id.clone(),
                            spatial_info.speed,
                            object_extra.get_classname(),
                        );
                    }
                    None => {
                        object_extra.spatial_info = Some(SpatialInfo::new(
                            last_time,
                            last_point.x,
                            last_point.y,
                            projected_pt.0,
                            projected_pt.1,
                        ));
                        zone.register_or_update_object(
                            object_id.clone(),
                            -1.0,
                            object_extra.get_classname(),
                        );
                    }
                }
            }
        }
        if enable_mjpeg || settings.output.enable {
            for (_, v) in zones.iter() {
                let polygon = v.lock().expect("Mutex poisoned");
                polygon.draw_geom(&mut frame);
                polygon.draw_skeleton(&mut frame);
                polygon.draw_current_intensity(&mut frame);
            }
        }

        // We need drop here explicitly, since we need to release lock on zones for MJPEG / REST API / Redis publisher and statistics threads
        drop(zones);
        drop(ds_guard);

        /* Imshow + re-stream input video as MJPEG */
        if enable_mjpeg || settings.output.enable {
            draw::draw_trajectories(
                &mut frame,
                &tracker,
                trajectory_scalar,
                trajectory_scalar_inverse,
            );
            draw::draw_bboxes(&mut frame, &tracker, bbox_scalar, bbox_scalar_inverse);
            draw::draw_identifiers(&mut frame, &tracker, id_scalar, id_scalar_inverse);
            draw::draw_speeds(&mut frame, &tracker, id_scalar, id_scalar_inverse);
            draw::draw_projections(&mut frame, &tracker, id_scalar, id_scalar_inverse);

            if settings.output.enable {
                match resize(
                    &mut frame,
                    &mut resized_frame,
                    Size::new(output_width, output_height),
                    1.0,
                    1.0,
                    1,
                ) {
                    Ok(_) => {}
                    Err(err) => {
                        panic!("Can't resize output frame due the error {:?}", err);
                    }
                }
                if resized_frame.size()?.width > 0 {
                    imshow(window, &mut resized_frame)?;
                }
                let key = wait_key(10)?;
                if key == 27 /* esc */ || key == 115 /* s */ || key == 83
                /* S */
                {
                    break;
                }
            }
        }
        if enable_mjpeg {
            let mut buffer = Vector::<u8>::new();
            let params = Vector::<i32>::new();
            let encoded = imencode(".jpg", &frame, &mut buffer, &params).unwrap();
            if !encoded {
                println!("image has not been encoded");
                continue;
            }
            match tx_mjpeg.send(buffer) {
                Ok(_) => {}
                Err(_err) => {
                    println!("Error on send frame to MJPEG thread: {}", _err)
                }
            };
        }
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let path_to_config = match args.len() {
        2 => &args[1],
        _ => {
            println!("Args should contain exactly one string: path to TOML configuration file. Setting to default './data/conf.toml'");
            "./data/conf.toml"
        }
    };
    let app_settings = AppSettings::new(path_to_config);
    println!("Settings are:\n\t{}", app_settings);

    let mut tracker = Tracker::new(15, 0.3);
    println!("Tracker is:\n\t{}", tracker);

    let mut neural_net = match prepare_neural_net(&app_settings.detection.model) {
        Ok(nn) => nn,
        Err(err) => {
            println!("Can't prepare neural network due the error: {}", err);
            return;
        }
    };

    let verbose = match &app_settings.debug {
        Some(x) => x.enable,
        None => false,
    };

    match run(
        &app_settings,
        path_to_config,
        &mut tracker,
        &mut neural_net.0,
        neural_net.1,
        verbose,
    ) {
        Ok(_) => {}
        Err(_err) => {
            println!("Error in main thread: {}", _err);
        }
    };
}

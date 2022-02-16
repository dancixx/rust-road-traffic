use actix_web::{web, http, App, HttpServer, HttpResponse, Responder};
use actix_cors::Cors;

use crate::lib::mjpeg_streaming::{
    broadcaster::Broadcaster
};

use std::sync::Mutex;
use std::thread;
use std::sync::mpsc::{
    Receiver
};

#[actix_web::main]
pub async fn start_mjpeg_streaming(server_host: String, server_port: i32, rx_frames_data: Receiver<std::vec::Vec<u8>>) -> std::io::Result<()> {
    let bind_address = format!("{}:{}", server_host, server_port);
    println!("MJPEG Streamer is starting on host:port {}:{}", server_host, server_port);

    thread::spawn(move || {
        for received in rx_frames_data {
            // println!("rec frame");
        }
    });

    let broadcaster = web::Data::new(Mutex::new(Broadcaster::default()));
    // @todo implement broadcaster communication with videocapture in main.rs

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allowed_headers(vec![http::header::ORIGIN, http::header::AUTHORIZATION, http::header::CONTENT_TYPE, http::header::CONTENT_LENGTH, http::header::ACCEPT, http::header::ACCEPT_ENCODING])
            .allowed_methods(vec!["GET"])
            .expose_headers(vec![http::header::CONTENT_LENGTH])
            .supports_credentials()
            .max_age(5600);
        App::new()
            .wrap(cors)
            .configure(init_routes)
    })
    .bind(&bind_address)
    .unwrap_or_else(|_| panic!("Could not bind MJPEG streamer to address: {}", &bind_address))
    .run()
    .await
}

async fn mjpeg_page() -> impl Responder {
    let content = include_str!("index.html");
    return HttpResponse::Ok().header("Content-Type", "text/html").body(content);
}

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/live", web::get().to(mjpeg_page));
}
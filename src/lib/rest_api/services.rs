use actix_web::{HttpResponse, web, Responder};
use actix_web_static_files::ResourceFiles;
include!(concat!(env!("OUT_DIR"), "/generated.rs"));

use crate::lib::rest_api::{
    zones_mutations,
    toml_mutations,
    mjpeg_page,
    mjpeg_client,
    zones_list,
    zones_stats
};

async fn say_ping() -> impl Responder {
    HttpResponse::Ok().body("pong")
}

pub fn init_routes(enable_mjpeg: bool) -> impl Fn(&mut web::ServiceConfig) {

    move |cfg| {
        let generated = generate();

        if enable_mjpeg {
            cfg
                .route("/live", web::get().to(mjpeg_page::mjpeg_page))
                .route("/live_streaming", web::get().to(mjpeg_client::add_new_client));
        }

        cfg
            .service(
                web::scope("/api")
                .route("/ping", web::get().to(say_ping))
                .service(
                    web::scope("/polygons")
                    .route("/geojson", web::get().to(zones_list::polygons_list))
                )
                .service(
                    web::scope("/stats")
                    .route("/all", web::get().to(zones_stats::all_zones_stats))
                )
                .service(
                    web::scope("/realtime")
                    .route("/occupancy", web::get().to(zones_stats::all_zones_occupancy))
                )
                .service(
                    web::scope("/mutations")
                    .route("/create_polygon", web::post().to(zones_mutations::create_zone))
                    .route("/change_polygon", web::post().to(zones_mutations::update_zone))
                    .route("/delete_polygon", web::post().to(zones_mutations::delete_zone))
                    .route("/replace_all", web::post().to(zones_mutations::replace_all))
                    .route("/save_toml", web::get().to(toml_mutations::save_toml))
                )
            );
        cfg.service(ResourceFiles::new("/", generated));
    }
}

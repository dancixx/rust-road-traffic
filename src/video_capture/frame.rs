use opencv::core::Mat;

pub struct ThreadedFrame {
    pub frame: Mat,
    pub current_second: f32,
}

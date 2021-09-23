use crate::settings::RoadLanesSettings;

use opencv::{
    core::Point,
    core::Scalar,
};

impl RoadLanesSettings {
    pub fn convert_to_convex_polygon(&self) -> ConvexPolygon{
        return ConvexPolygon{
            coordinates: self.geometry
                .iter()
                .map(|pt| Point::new(pt[0], pt[1]))
                .collect(),
            // RGB to OpenCV = [B, G, R]. So use reverse order
            color: Scalar::from((self.color_rgb[2] as f64, self.color_rgb[1] as f64, self.color_rgb[0] as f64)),
        }
    }
}

use opencv::{
    core::Mat,
    imgproc::LINE_8,
    imgproc::line
};

#[derive(Debug)]
pub struct ConvexPolygon {
    coordinates: Vec<Point>,
    color: Scalar
}

impl ConvexPolygon {
    pub fn draw_on_mat(&self, img: &mut Mat) {
        // @todo: proper error handling
        for i in 1..self.coordinates.len() {
            let prev_pt = self.coordinates[i - 1];
            let current_pt = self.coordinates[i];
            match line(img, prev_pt, current_pt, self.color, 2, LINE_8, 0) {
                Ok(_) => {},
                Err(err) => {
                    panic!("Can't draw line for polygon due the error: {:?}", err)
                }
            };
        }
        match line(img, self.coordinates[self.coordinates.len() - 1], self.coordinates[0], self.color, 2, LINE_8, 0) {
            Ok(_) => {},
            Err(err) => {
                panic!("Can't draw line for polygon due the error: {:?}", err)
            }
        };
    }
    pub fn contains_point(&self, x: i32, y: i32) -> bool {
        let n = self.coordinates.len();
        // @todo: math.maxInt could lead to overflow obviously. Need good workaround. PRs are welcome
        let extreme_point = vec![99999.0, y as f32];
        let mut intersections_cnt = 0;
	    let mut previous = 0;
        let x_f32 = x as f32;
        let y_f32 = y as f32;
        loop {
            let current = (previous + 1) % n;
            // Check if the segment from given point P to extreme point intersects with the segment from polygon point on previous interation to  polygon point on current interation
            if is_intersects(
                self.coordinates[previous].x as f32, self.coordinates[previous].y as f32,
                self.coordinates[current].x as f32, self.coordinates[current].y as f32,
                x_f32, y_f32,
                extreme_point[0], extreme_point[1]
            ) 
            {
                let orientation = get_orientation(
                    self.coordinates[previous].x as f32, self.coordinates[previous].y as f32,
                    x_f32, y_f32,
                    self.coordinates[current].x as f32, self.coordinates[current].y as f32
                );
                // If given point P is collinear with segment from polygon point on previous interation to  polygon point on current interation
                if orientation == PointsOrientation::Collinear {
                    // then check if it is on segment
				    // 'True' will be returns if it lies on segment. Otherwise 'False' will be returned
                    return is_on_segment(
                        self.coordinates[previous].x as f32, self.coordinates[previous].y as f32,
                        x_f32, y_f32,
                        self.coordinates[current].x as f32, self.coordinates[current].y as f32
                    );
                }
                intersections_cnt += 1;
            }
            previous = current;
            if previous == 0 {
                break;
            }
        }
        // If ray intersects even number of times then return true
        // Otherwise return false
        if intersections_cnt%2 == 1 {
            return true
        }
        return false
    }
    pub fn contains_cv_point(&self, pt: &Point) -> bool {
        return self.contains_point(pt.x, pt.y);
    }
}

#[derive(Copy, Clone, PartialEq)]
pub enum PointsOrientation {
    Collinear,
    Clockwise,
    CounterClockwise
}

// get_orientation Gets orientations of points P -> Q -> R.
// Possible output values: Collinear / Clockwise or CounterClockwise
// Input: points P, Q and R in provided order
fn get_orientation(px: f32, py: f32, qx: f32, qy: f32, rx: f32, ry: f32) -> PointsOrientation {
    let val = (qy-py)*(rx-qx) - (qx-px)*(ry-qy);
	if val == 0.0 {
		return PointsOrientation::Collinear;
	}
	if val > 0.0 {
		return PointsOrientation::Clockwise;
	}
    return PointsOrientation::CounterClockwise; // if it's neither collinear nor clockwise
}

// is_on_segment Checks if point Q lies on segment PR
// Input: three colinear points Q, Q and R
fn is_on_segment(px: f32, py: f32, qx: f32, qy: f32, rx: f32, ry: f32) -> bool {
    if qx <= f32::max(px, rx) && qx >= f32::min(px, rx) && qy <= f32::max(py, ry) && qy >= f32::min(py, ry) {
		return true
	}
    return false;
}

// is_intersects Checks if segments intersect each other
// Input:
// first_px, first_py, first_qx, first_qy === first segment
// second_px, second_py, second_qx, second_qy === second segment
/*
Notation
	P1 = (first_px, first_py)
	Q1 = (first_qx, first_qy)
	P2 = (second_px, second_py)
	Q2 = (second_qx, second_qy)
*/
fn is_intersects(first_px: f32, first_py: f32, first_qx: f32, first_qy: f32, second_px: f32, second_py: f32, second_qx: f32, second_qy: f32) -> bool {
    // Find the four orientations needed for general case and special ones
    let o1 = get_orientation(first_px, first_py, first_qx, first_qy, second_px, second_py);
    let o2 = get_orientation(first_px, first_py, first_qx, first_qy, second_qx, second_qy);
    let o3 = get_orientation(second_px, second_py, second_qx, second_qy, first_px, first_py);
    let o4 = get_orientation(second_px, second_py, second_qx, second_qy, first_qx, first_qy);

    // General case
    if o1 != o2 && o3 != o4 {
        return true;
    }

    /* Special cases */
    // P1, Q1, P2 are colinear and P2 lies on segment P1-Q1
    if o1 == PointsOrientation::Collinear && is_on_segment(first_px, first_py, second_px, second_py, first_qx, first_qy) {
        return true;
    }
    // P1, Q1 and Q2 are colinear and Q2 lies on segment P1-Q1
    if o2 == PointsOrientation::Collinear && is_on_segment(first_px, first_py, second_qx, second_qy, first_qx, first_qy) {
        return true;
    }
    // P2, Q2 and P1 are colinear and P1 lies on segment P2-Q2
    if o3 == PointsOrientation::Collinear && is_on_segment(second_px, second_py, first_px, first_py, second_qx, second_qy) {
        return true;
    }
    // P2, Q2 and Q1 are colinear and Q1 lies on segment P2-Q2
    if o4 == PointsOrientation::Collinear && is_on_segment(second_px, second_py, first_qx, first_qy, second_qx, second_qy) {
        return true;
    }
    // Segments do not intersect
    return false;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_contains_point() {
        let convex_polygons = vec![
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 0),
                    Point::new(5, 5),
                    Point::new(0, 5),
                ],
                color: Scalar::default(),
            },
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 0),
                    Point::new(5, 5),
                    Point::new(0, 5),
                ],
                color: Scalar::default(),
            },
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 5),
                    Point::new(5, 0),
                ],
                color: Scalar::default(),
            },
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 5),
                    Point::new(5, 0),
                ],
                color: Scalar::default(),
            },
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 5),
                    Point::new(5, 0),
                ],
                color: Scalar::default(),
            },
            ConvexPolygon{
                coordinates: vec![
                    Point::new(0, 0),
                    Point::new(5, 0),
                    Point::new(5, 5),
                    Point::new(0, 5),
                ],
                color: Scalar::default(),
            }
        ];
        let points = vec![
            Point::new(20, 20),
            Point::new(4, 4),
            Point::new(3, 3),
            Point::new(5, 1),
            Point::new(7, 2),
            Point::new(-2, 12)
        ];
        let correct_answers = vec![
            false,
            true,
            true,
            true,
            false,
            false
        ];
        for (i, convex_polygon) in convex_polygons.iter().enumerate() {
            let answer = convex_polygon.contains_point(points[i].x, points[i].y);
            assert_eq!(answer, correct_answers[i]);
        }
    }
}
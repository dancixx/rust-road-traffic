const UUIDv4 = new function() {
    // https://dirask.com/posts/JavaScript-UUID-function-in-Vanilla-JS-1X9kgD
	const generateNumber = (limit) => {
	   const value = limit * Math.random();
	   return value | 0;
	};
	const generateX = () => {
		const value = generateNumber(16);
		return value.toString(16);
	};
	const generateXes = (count) => {
		let result = '';
		for(let i = 0; i < count; ++i) {
			result += generateX();
		}
		return result;
	};
	const generateVariant = () => {
		const value = generateNumber(16);
		const variant = (value & 0x3) | 0x8;
		return variant.toString(16);
	};
    // UUID v4
    //
    //   varsion: M=4 
    //   variant: N
    //   pattern: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
    //
	this.generate = function() {
  	    const result = generateXes(8)
  	           + '-' + generateXes(4)
  	           + '-' + '4' + generateXes(3)
  	           + '-' + generateVariant() + generateXes(3)
  	           + '-' + generateXes(12)
  	    return result;
	};
};

function getRandomRGB() {
    // https://stackoverflow.com/a/23095731/6026885
    const num = Math.round(0xffffff * Math.random());
    const r = num >> 16;
    const g = num >> 8 & 255;
    const b = num & 255;
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

const rgba2array = (rgbValue) => {
    // https://stackoverflow.com/a/34980657/6026885
    const match = rgbValue.match(/rgba?\((\d{1,3}), ?(\d{1,3}), ?(\d{1,3})\)?(?:, ?(\d(?:\.\d?))\))?/);
    return match ? [
        match[1],
        match[2],
        match[3]
    ].map(Number) : [];
}

function Enum(obj) {
    const newObj = {};
    for( const prop in obj ) {
        if (obj.hasOwnProperty(prop)) {
            newObj[prop] = Symbol(obj[prop]);
        }
    }
    return Object.freeze(newObj);
}
const States = Enum({ AddingPolygon: true, Waiting: true, EditingPolygon: true, DeletingPolygon: true, PickPolygon: true});

const drawCountour = (fbCanvas, coordinates) => {
    const clientW = fbCanvas.clientWidth;
    const clientH = fbCanvas.clientHeight;
    let ctx = fbCanvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'blue';
    ctx.clearRect(0, 0, clientW, clientH);
    ctx.beginPath();
    ctx.moveTo(coordinates[0].x, coordinates[0].y);
    for(index=1; index<coordinates.length;index++) {
        ctx.lineTo(coordinates[index].x, coordinates[index].y);
    }
    ctx.closePath();
    ctx.stroke();
}

const findLeftTopY = (coordinates) => {
    return Math.abs(Math.min.apply(Math, coordinates.map(function(a) { 
        return a.y;
    })));

}

const findLefTopX = (coordinates) => {
    return Math.abs(Math.min.apply(Math, coordinates.map(function(a) { 
        return a.x;
    })));
}

const makeContour = (coordinates, color = getRandomRGB()) => {
    let left = findLefTopX(coordinates);
    let top = findLeftTopY(coordinates);
    // coordinates[coordinates.length-1] = coordinates[0];  // In case of fabric.Polyline               
    let contour = new fabric.Polygon(coordinates, {
        fill: 'rgba(0,0,0,0)',
        stroke: color,
        strokeWidth: 3,
        objectCaching: false
    });
    contour.set({
        left: left,
        top: top,
    });
    return contour;
}

function editContour(contour, fbCanvas) {
    fbCanvas.setActiveObject(contour);
    contour.edit = !contour.edit;
    if (contour.edit) {
        let lastControl = contour.points.length - 1;
        contour.cornerStyle = 'circle';
        contour.cornerSize = 15;
        contour.cornerColor = 'rgba(0, 0, 255, 1.0)';
        contour.controls = contour.points.reduce(function(acc, point, index) {
            acc['p' + index] = new fabric.Control({
                positionHandler: polygonPositionHandler,
                actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, actionHandler),
                actionName: 'modifyPolygon',
                pointIndex: index
            });
            return acc;
        }, { });
    } else {
        contour.cornerColor = 'rgb(178, 204, 255)';
        contour.cornerStyle = 'rect';
        contour.controls = fabric.Object.prototype.controls;
    }
    contour.hasBorders = !contour.edit;
    fbCanvas.requestRenderAll();
}

function deleteContour(contour, fbCanvas, dataStorage, map) {
    fbCanvas.remove(contour[0]);
    dataStorage.delete(contour[0].unid);
    if (map.getLayer(`layer-polygon-${contour[0].unid}`)) {
        map.removeLayer(`layer-polygon-${contour[0].unid}`);
    }
    if (map.getSource(`source-polygon-${contour[0].unid}`)) {
        map.removeSource(`source-polygon-${contour[0].unid}`);
    }
}

const getClickPoint = (fbCanvas, options) => {
    // const bbox = canvas.getBoundingClientRect();
    // const left = bbox.left;
    // const top = bbox.top;
    const left = fbCanvas._offset.left;
    const top = fbCanvas._offset.top;
    const drawX = options.e.pageX - left;
    const drawY = options.e.pageY - top;
    return {x: drawX, y: drawY};
}

const getObjectSizeWithStroke = (object) => {
    let stroke = new fabric.Point(
        object.strokeUniform ? 1 / object.scaleX : 1, 
        object.strokeUniform ? 1 / object.scaleY : 1
    ).multiply(object.strokeWidth);
    return new fabric.Point(object.width + stroke.x, object.height + stroke.y);
}

// define a function that can locate the controls.
// this function will be used both for drawing and for interaction.
// this is not an anonymus function since we need parent scope (`this`)
const polygonPositionHandler = function (dim, finalMatrix, fabricObject) {
    let x = (fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x);
    let y = (fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y);
    return fabric.util.transformPoint(
        { x: x, y: y },
        fabric.util.multiplyTransformMatrices(
            fabricObject.canvas.viewportTransform,
            fabricObject.calcTransformMatrix()
        )
    );
}

// define a function that will define what the control does
// this function will be called on every mouse move after a control has been
// clicked and is being dragged.
// The function receive as argument the mouse event, the current trasnform object
// and the current position in canvas coordinate
// transform.target is a reference to the current object being transformed,
const actionHandler = function (eventData, transform, x, y) {
    let polygon = transform.target;
    let currentControl = polygon.controls[polygon.__corner];
    let mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center')
    let polygonBaseSize = getObjectSizeWithStroke(polygon);
    let size = polygon._getTransformedDimensions(0, 0);
    let finalPointPosition = {
        x: mouseLocalPosition.x * polygonBaseSize.x / size.x + polygon.pathOffset.x,
        y: mouseLocalPosition.y * polygonBaseSize.y / size.y + polygon.pathOffset.y
    };
    polygon.points[currentControl.pointIndex] = finalPointPosition;
    return true;
}

// define a function that can keep the polygon in the same position when we change its
// width/height/top/left.
const anchorWrapper = function (anchorIndex, fn) {
    return function(eventData, transform, x, y) {
        let fabricObject = transform.target;
        let absolutePoint = fabric.util.transformPoint({
            x: (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x),
            y: (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y),
        }, fabricObject.calcTransformMatrix());
        let actionPerformed = fn(eventData, transform, x, y);
        let newDim = fabricObject._setPositionDimensions({});
        let polygonBaseSize = getObjectSizeWithStroke(fabricObject);
        let newX = (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x) / polygonBaseSize.x;
        let newY = (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y) / polygonBaseSize.y;
        fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
        return actionPerformed;
    }
}

const addTooltip = (parentDiv, options) => {
    // @todo make cool popup with edit/trash signs

    // let div = document.createElement('div');
    // div.style.cssText = 'position:fixed;padding:7px;background:gold;pointer-events:none;width:30px';
    // div.innerHTML = 'potato';
    // div.style.left = `${options.target.aCoords.br.x}px`;
    // div.style.top = `${options.target.aCoords.br.y}px`; 
    // parentDiv.appendChild(div);
}

async function getPolygons() {
    return await axios({
        method: 'GET',
        url: 'http://localhost:42001/api/polygons/geojson',
        timeout: 5000,
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(res => res.data)
    .catch (err => console.error(err));
}

const drawGeoPolygons = (map, featureCollection) => {
    featureCollection.features.forEach(feature => {
        map.addSource(`source-polygon-${feature.id}`, {
            'type': 'geojson',
            'data': feature
        });
        map.addLayer({
            'id': `layer-polygon-${feature.id}`,
            'type': 'fill',
            'source': `source-polygon-${feature.id}`,
            'layout': {},
            'paint': {
                'fill-color': `rgb(${feature.properties.color_rgb[0]},${feature.properties.color_rgb[1]},${feature.properties.color_rgb[2]})`,
                'fill-opacity': 0.8
            }
        });
    });
    if (featureCollection.features.length === 0) {
        return
    }
    const firstCoordinates = featureCollection.features[0].geometry.coordinates;
    let llBbox = new maplibregl.LngLatBounds(firstCoordinates[0]);
    for (const coord of firstCoordinates) {
        llBbox.extend(coord);
    }
    map.fitBounds(llBbox, {
        padding: 20
    });
};

const drawPolygons = (fbCanvas, dataStorage, state, scaleWidth, scaleHeight) => {
    dataStorage.forEach(feature => {
        const contourFinalized = feature.properties.coordinates.map(element => {
            return {
                x: element[0]*scaleWidth,
                y: element[1]*scaleHeight
            }
        });
        let contour = makeContour(contourFinalized, `rgb(${feature.properties.color_rgb[0]},${feature.properties.color_rgb[1]},${feature.properties.color_rgb[2]})`);
        contour.on('mousedown', (options) => {
            options.e.preventDefault();
            options.e.stopPropagation();
            state = States.PickPolygon;
            if (options.button === 3) {
                state = States.EditingPolygon;
                if (state !== States.EditingPolygon) {
                    state = States.EditingPolygon;
                } else {
                    state = States.Waiting;
                }
                editContour(contour, fbCanvas);
            }
        });
        contour.unid = feature.id;
        fbCanvas.add(contour);
        fbCanvas.renderAll();
    })
}

class ApplicationUI {
    constructor() {
        this.dataStorage = new Map();
        this.initCanvas();
        this.state = States.Waiting;
    }
    initCanvas() {
        let canvas = document.getElementById('fit_canvas');
        let image = document.getElementById('fit_img');
        canvas.width = image.clientWidth;
        canvas.height = image.clientHeight;
        this.fbCanvas = new fabric.Canvas('fit_canvas', {
            containerClass: 'custom-container-canvas',
            fireRightClick: true,  
            fireMiddleClick: true, 
            stopContextMenu: true
        });
        this.fbCanvasParent = document.getElementsByClassName('custom-container-canvas')[0];
        this.fbCanvasParent.id = "fbcanvas";
    }
    attachMap(map) {
        this.map = map;
    }
    deletePolygon(polygonID) {
        this.fbCanvas.getObjects().forEach( contour => {
            if (contour.unid === polygonID) {
                this.fbCanvas.remove(contour);
                return
            }
        })
        this.dataStorage.delete(polygonID);
        if (this.map.getLayer(`layer-polygon-${polygonID}`)) {
            this.map.removeLayer(`layer-polygon-${polygonID}`);
        }
        if (this.map.getSource(`source-polygon-${polygonID}`)) {
            this.map.removeSource(`source-polygon-${polygonID}`);
        }
    }
    stateAdd() {
        if (this.state !== States.AddingPolygon) {
            this.state = States.AddingPolygon
        } else {
            this.state = States.Waiting;
        }
    }
    stateDel() {
        if (this.state !== States.DeletingPolygon) {
            this.state = States.DeletingPolygon
        } else {
            this.state = States.Waiting;
        }
    }
}

window.onload = function() {
    const elems = document.querySelectorAll('.fixed-action-btn');
    const instances = M.FloatingActionButton.init(elems, {
        direction: 'left',
        hoverEnabled: false
    });

    let map = new maplibregl.Map({
        container: 'map', // container id
        style: 'https://api.maptiler.com/maps/44abc03b-626b-41bb-8fcd-a0e5083c9d0d/style.json?key=dznzK4GQ1Lj5U7XsI22j',
        center: [0, 0], // starting position [lng, lat]
        zoom: 1 // starting zoom
    });

    let app = new ApplicationUI();
    app.attachMap(map);

    const addBtn = document.getElementById('add-btn');
    addBtn.addEventListener('click', (e) => {
        app.stateAdd();
    });

    const delBtn = document.getElementById('del-btn');
    delBtn.addEventListener('click', (e) => {
        app.stateDel();
    });

    let image = document.getElementById('fit_img');
    let scaleWidth = image.clientWidth/image.naturalWidth;
    let scaleHeight = image.clientHeight/image.naturalHeight;

    getPolygons().then((data) => {
        data.features.forEach(feature => {
            app.dataStorage.set(feature.id, feature);
        });
        map.on('load', () => {
            drawGeoPolygons(map, data);
        });
        drawPolygons(app.fbCanvas, app.dataStorage, app.state, scaleWidth, scaleHeight);
    })

    let contourTemporary = [];
    let contourFinalized = [];
    app.fbCanvas.on('mouse:down', (options) => {
        if (app.state === States.AddingPolygon) {
            app.fbCanvas.selection = false;
            let clicked = getClickPoint(app.fbCanvas, options);
            contourFinalized.push({ x: clicked.x, y: clicked.y });
            let points = [clicked.x, clicked.y, clicked.x, clicked.y]
            let newLine = new fabric.Line(points, {
                strokeWidth: 3,
                selectable: false,
                stroke: 'purple',
            })
            // contourTemporary.push(n.setOriginX(clickX).setOriginY(clickY));
            contourTemporary.push(newLine);
            app.fbCanvas.add(newLine);
            app.fbCanvas.on('mouse:up', function (options) {
                app.fbCanvas.selection = true;
            });

            if (contourFinalized.length > 3) {
                contourTemporary.forEach((value) => {
                    app.fbCanvas.remove(value);
                });
                let contour = makeContour(contourFinalized);
                contour.on('mousedown', (options) => {
                    options.e.preventDefault();
                    options.e.stopPropagation();
                    app.state = States.PickPolygon;
                    // Handle right-click
                    // Turn on "Edit" mode
                    if (options.button === 3) {
                        // addTooltip(fbCanvasParent, options);
                        if (app.state !== States.EditingPolygon) {
                            app.state = States.EditingPolygon;
                        } else {
                            app.state = States.Waiting;
                        }
                        editContour(contour, app.fbCanvas);
                    }
                });
                contour.unid = UUIDv4.generate();
                app.dataStorage.set(contour.unid, {
                    type: 'Feature',
                    id: contour.unid,
                    properties: {
                        'color_rgb': rgba2array(contour.stroke),
                        'coordinates': contour.points.map(element => {
                            return [
                                Math.floor(element.x/scaleWidth),
                                Math.floor(element.y/scaleHeight)
                            ]
                        }),
                        'road_lane_direction': -1,
                        'road_lane_num': -1
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[[], [], [], [], []]]
                    }
                });
                app.fbCanvas.add(contour);
                app.fbCanvas.renderAll();
                contourTemporary = [];
                contourFinalized = [];
                app.state = States.Waiting;
            }
        }
    });

    app.fbCanvas.on('selection:created', (options) => {
        if (app.state === States.DeletingPolygon) {
            app.deletePolygon(options.selected[0].unid);
            app.state = States.Waiting;
        }
    })

    app.fbCanvas.on('selection:updated', (options) => {
        if (app.state === States.DeletingPolygon) {
            app.deletePolygon(options.selected[0].unid);
            app.state = States.Waiting;
        }
    })

    app.fbCanvas.on('mouse:move', (options) => {
        if (contourTemporary[0] !== null && contourTemporary[0] !== undefined && app.state === States.AddingPolygon) {
            let clicked = getClickPoint(app.fbCanvas, options);
            contourTemporary[contourTemporary.length - 1].set({ x2: clicked.x, y2: clicked.y });
            app.fbCanvas.renderAll();
        }
    });
}

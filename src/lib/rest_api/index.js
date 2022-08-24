function Enum(obj) {
    const newObj = {};
    for( const prop in obj ) {
        if (obj.hasOwnProperty(prop)) {
            newObj[prop] = Symbol(obj[prop]);
        }
    }
    return Object.freeze(newObj);
}
const States = Enum({ AddingPolygon: true, Waiting: true });
var currentState = States.Waiting;

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

const minMax = (arr) => {
    return arr.reduce(function(acc, cur) {
        console.log(acc, cur)
        return [
            Math.min(cur.x, acc[0].x),
            Math.max(cur.x, acc[1].x)
        ]
    }, [{x: Number.POSITIVE_INFINITY}, {x: Number.NEGATIVE_INFINITY}]);
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

const makeContour = (coordinates) => {
    let left = findLefTopX(coordinates);
    let top = findLeftTopY(coordinates);
    coordinates.pop() // inplace mutation for delete last duplicate point
    // coordinates[coordinates.length-1] = coordinates[0];  // In case of fabric.Polyline               
    let contour = new fabric.Polygon(coordinates, {
        fill: 'rgba(0,0,0,0)',
        stroke:'#58c',
        strokeWidth: 3,
        objectCaching: false
    });
    contour.set({
        left: left,
        top: top,
    });
    return contour;
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
    var stroke = new fabric.Point(
        object.strokeUniform ? 1 / object.scaleX : 1, 
        object.strokeUniform ? 1 / object.scaleY : 1
    ).multiply(object.strokeWidth);
    return new fabric.Point(object.width + stroke.x, object.height + stroke.y);
}

// define a function that can locate the controls.
// this function will be used both for drawing and for interaction.
// this is not an anonymus function since we need parent scope (`this`)
const polygonPositionHandler = function (dim, finalMatrix, fabricObject) {
    var x = (fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x);
    var y = (fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y);
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
        // let newDim = fabricObject._setPositionDimensions({});
        let polygonBaseSize = getObjectSizeWithStroke(fabricObject);
        let newX = (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x) / polygonBaseSize.x;
        let newY = (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y) / polygonBaseSize.y;
        fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5);
        return actionPerformed;
    }
}

window.onload = function() {
    let map = new maplibregl.Map({
        container: 'map', // container id
        style: 'https://demotiles.maplibre.org/style.json', // style URL
        center: [0, 0], // starting position [lng, lat]
        zoom: 1 // starting zoom
    });
    let addBtn = document.getElementById('add-btn');
    addBtn.addEventListener('click', (e) => {
        if (currentState !== States.AddingPolygon) {
            currentState = States.AddingPolygon
        }
    });

    let canvas = document.getElementById('fit_canvas');
    let image = document.getElementById('fit_img');
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
    let fbCanvas = new fabric.Canvas('fit_canvas', {containerClass: 'custom-container-canvas'});

    let contourTemporary = [];
    let contourFinalized = [];
    fbCanvas.on('mouse:down', (options) => {
        if (currentState === States.AddingPolygon) {
            fbCanvas.selection = false;
            let clicked = getClickPoint(fbCanvas, options);
            contourFinalized.push({ x: clicked.x, y: clicked.y });
            let points = [clicked.x, clicked.y, clicked.x, clicked.y]
            let newLine = new fabric.Line(points, {
                strokeWidth: 3,
                selectable: false,
                stroke: 'purple',
            })
            // contourTemporary.push(n.setOriginX(clickX).setOriginY(clickY));
            contourTemporary.push(newLine);
            fbCanvas.add(newLine);
            fbCanvas.on('mouse:up', function (options) {
                fbCanvas.selection = true;
            });
        }
    });

    fbCanvas.on('mouse:move', (options) => {
        if (contourTemporary[0] !== null && contourTemporary[0] !== undefined && currentState === States.AddingPolygon) {
            let clicked = getClickPoint(fbCanvas, options);
            contourTemporary[contourTemporary.length - 1].set({ x2: clicked.x, y2: clicked.y });
            fbCanvas.renderAll();
        }
    });

    fbCanvas.on('mouse:dblclick', (options) => {
        contourTemporary.forEach((value) => {
            fbCanvas.remove(value);
        });
        let contour = makeContour(contourFinalized);
        fbCanvas.add(contour);
        fbCanvas.renderAll();
        contourTemporary = [];
        contourFinalized = [];
        currentState = States.Waiting;

        edit(fbCanvas);
        
    });

    function edit(fbCanvas) {
        console.log('enter edit mode');
        let lastContour = fbCanvas.getObjects()[0];
		fbCanvas.setActiveObject(lastContour);
        console.log('last', lastContour)
        lastContour.edit = !lastContour.edit;
        if (lastContour.edit) {
            let lastControl = lastContour.points.length - 1;
            lastContour.cornerStyle = 'circle';
            lastContour.cornerColor = 'rgba(0,0,255,0.5)';
            lastContour.controls = lastContour.points.reduce(function(acc, point, index) {
				acc['p' + index] = new fabric.Control({
					positionHandler: polygonPositionHandler,
					actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, actionHandler),
					actionName: 'modifyPolygon',
					pointIndex: index
				});
                console.log('acc');
				return acc;
			}, { });
        } else {
            lastContour.cornerColor = 'red';
            lastContour.cornerStyle = 'rect';
			lastContour.controls = fabric.Object.prototype.controls;
        }
        lastContour.hasBorders = !lastContour.edit;
		fbCanvas.requestRenderAll();
    }
}
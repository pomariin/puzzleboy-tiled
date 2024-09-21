/// <reference types="@mapeditor/tiled-api" />
/*
MIT License

Copyright (c) 2024 pomariin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var extensionFolder = FileInfo.path(__filename)

function pbRead(fileName) {
    var file = new BinaryFile(fileName, BinaryFile.ReadOnly);
    var buffer = file.readAll()
    file.close()
    var view = new DataView(buffer)
    var map = new TileMap();

    if (view.byteLength !== 828) {
        tiled.error("PuzzleBoy.js: This file can't be read. If this is vanilla map 30, 33, 35, 41, 44 or 46, a fixed version exists in the Nocturne HD Gamebanana page.")
        return;
    }

    var tileset = loadTileset()
    if (!tileset.isTileset) {
        tiled.error("PuzzleBoy.js: The tileset is invalid. Please choose a different file.")
        return;
    }
    map.addTileset(tileset);
    
    map.setSize(20, 20);
    map.setTileSize(tileset.tileWidth, tileset.tileHeight);

    buildLayers(view);

    return map;

    function loadTileset() {
        var tilesetPath;
        var overrideTileset = tiled.confirm("Do you want to use a custom tileset?");
        if (overrideTileset) {
            tilesetPath = tiled.promptOpenFile(FileInfo.path(fileName), "Tileset file *.tsx *.xml *.tsj *.json", "Load tileset");
        }
        if (!tilesetPath) {
            tilesetPath = FileInfo.joinPaths(extensionFolder, "PB_Tileset.tsx");
        }
        tiled.log(`PuzzleBoy.js: Using tileset at: ${FileInfo.cleanPath(tilesetPath)}`);

        return tiled.open(tilesetPath);
    }

    function getObjects(view) {
        var objects = {
            start: [],
            goal: []
        }

        var amount = view.getUint8(0);
        var counter = 0;

        // Start positions
        for (let i = 0; i < 4; i++) {
            var enabledOffset = i + 4
            var chara = view.getUint8(enabledOffset)
            var enabled = Boolean(chara)
            if (chara >= 2) {
                tiled.warn(`PuzzleBoy.js: Invalid value at offset 0x${enabledOffset}, treating start object ${i} as disabled.`);
                enabled = false;
            }
            
            if (enabled) {
                if (counter > amount) { // The spam is avoidable
                    tiled.warn(`PuzzleBoy.js: Too many start objects, the rest will be disabled.`);
                    enabled = false;
                } else {
                    counter++;
                }
            }

            var posOffset = 8 + (i * 4);
            var x = view.getUint8(posOffset);
            var y = view.getUint8(posOffset + 2);

            if (enabled == true || x != 0 || y != 0) { // Ignore unset positions
                objects.start.push([enabled, x, y]);
            }
        }

        // Goal position
        var goalOffset = 24;
        var goal = [view.getUint8(goalOffset), view.getUint8(goalOffset + 2)];
        objects.goal = goal;

        return objects;
    }

    function buildLayers(view) {

        function buildTileLayers() {
            // Pass 1: create layers for each group
            for (let i = 0; i < view2.byteLength; i = i + 2) {
                var groupID = view2.getUint8(i).toString(10);
                newLayerIfMissing(tileLayers, groupID)
            }

            // Pass 2: copy tiles to their layer
            for (let i = 0; i < view2.byteLength; i = i + 2) {
                
                var arrPos = i/2
                var x = arrPos % 20;
                var y = (map.height - 1) - (arrPos - x) / 20;

                var groupID = view2.getUint8(i).toString(10)
                var tile = view2.getUint8(i+1).toString(16).padStart(2, "0").toUpperCase()

                // Find tileset tile
                var tsTile;
                for (let t = 0; t < ts.tiles.length; t++) {
                    if (tile == "20") {
                        tsTile = null;
                        break;
                    }
                    if (ts.findTile(t).className == tile) {
                        tsTile = ts.findTile(t)
                        break;
                    }
                }

                // Set tile
                for (let l = 0; l < tileLayers.length; l++) {
                    var layer;
                    if (tileLayers[l].name == groupID) {
                        layer = tileLayers[l].edit();
                        layer.setTile(x, y, tsTile)
                        layer.apply()
                    }
                }
            }

            // Pass 3: add layers to tilemap
            tileLayers.sort(function(a, b){return a.name - b.name}); 
            for (let i = 0; i < tileLayers.length; i++) {
                map.addLayer(tileLayers[i]);
            }
        }

        function buildObjectLayer() {

            function addStart(id) {
                let obj = new MapObject();
                obj.className = "Start";
                obj.x = objs.start[id][1] * tileset.tileWidth;
                obj.y = (map.height - 1 - objs.start[id][2]) * tileset.tileHeight;
                obj.width = tileset.tileWidth;
                obj.height = tileset.tileHeight;
                obj.setProperty("Slot ID", id);
                obj.setProperty("Enabled", objs.start[id][0]);
                objLayer.addObject(obj);
            }
    
            function addGoal() {
                let obj = new MapObject();
                obj.className = "Goal";
                obj.x = objs.goal[0] * tileset.tileWidth;
                obj.y = (map.height - 1 - objs.goal[1]) * tileset.tileHeight;
                obj.width = tileset.tileWidth;
                obj.height = tileset.tileHeight;
                objLayer.addObject(obj);
            }

            var objLayer = new ObjectGroup("Objects");
            var objs = getObjects(view);
            for (let i = 0; i < objs.start.length; i++) {
                addStart(i)
            }
            addGoal()
            map.addLayer(objLayer);
        }

        function newLayerIfMissing(array, name) {
            var layer;
            for (let i = 0; i < array.length; i++) {
                if (array[i].name == name) {
                    layer = array[i];
                }
            }
            if (!layer) {
                var l = new TileLayer(name);
                l.width = map.width;
                l.height = map.height;
                array.push(l);
                layer = array[-1];
            }
        }

        var mapOffset = 28;
        var view2 = new DataView(buffer, mapOffset);
        var tileLayers = [];
        var ts = map.tilesets[0];

        buildTileLayers()
        buildObjectLayer()
    }
}

function pbWrite(map, fileName) {

    var tileLayers = [];
    var objects = {
        start: [],
        goal: []
    };

    if (map.width != 20 || map.height != 20) {
        tiled.error("PuzzleBoy.js: Your map is not 20x20. Aborting export.");
        return;
    }

    for (var i = 0; i < map.layerCount; ++i) {
        var layer = map.layerAt(i);
        var groupID;

        if (layer.isTileLayer) {
            getTileData(layer);
        }
        if (layer.isObjectLayer) {
            getObjectData(layer);
        }
    }

    if (objects.goal.length == 0) {
        tiled.warn("PuzzleBoy.js: No goal object found. Default goal position is [0, 19].")
    }

    var gridData = mergeLayers(tileLayers);
    exportFile();
    
    function getTileData(layer) {

        function assignGroupFromName(name) {

            function doesGroupExist(array, id) {
                for (var i = 0; i < array.length; ++i) {
                    if (array[i].id == id) {
                        return true;
                    }
                }
                return false;
            }

            // parseInt doesn't work properly (???)
            let group = Number(name);
            if (isNaN(group)) {
                group = name // Revert change if the conversion failed
            }

            // Is there a layer with the same name? Copy its group ID
            for (var l = 0; l < tileLayers.length; ++l) {
                if (tileLayers[l].ogName == name) {
                    return tileLayers[l].id;
                }
            }

            if (typeof group === "number" && group < 256) {
                return group;
            } 
            
            // If all else fails, find a new ID 

            if (group >= 256) {
                tiled.warn(`PuzzleBoy.js: Group name ${group} is too big a number to be used. Searching for a new ID might break things.`);
            }

            if (tileLayers.length == 0) { 
                return 0;
            }

            // Find highest ID number
            var biggest = 0;
            for (var l = 0; l < tileLayers.length; ++l) {
                if (tileLayers[l].id > biggest) {
                    biggest = tileLayers[l].id;
                };
            }
            // Search for the first empty group
            for (var l = 0; l <= biggest; ++l) {
                if (!doesGroupExist(tileLayers, l)) {
                    id = l;
                    return id;
                }
            }
        }

        groupID = assignGroupFromName(layer.name);
        var grid = [];

        for (y = layer.height -1; y >= 0; --y) { // y = 0 is on the bottom
            for (x = 0; x < layer.width; ++x) {
                // The ID is determined by the class, to allow for some degree of flexibility when making the tileset
                const tile = layer.tileAt(x, y);
                if (tile !== null) {
                    grid.push(tile.className); 
                } else {
                    grid.push("empty");
                }
            }
        }

        var contents = {
            "ogName": layer.name,
            "id": groupID,
            "grid": grid,
        };
        tileLayers.push(contents);
    }

    function getObjectData(layer) {
        for (var obj = 0; obj < layer.objectCount; ++obj) {
            var currentTile = layer.objectAt(obj)
            // Snap objects to grid
            var xNew = Math.round(currentTile.x / map.tileWidth)
            var yNew = (map.height - 1) - Math.round(currentTile.y / map.tileHeight)

            if (currentTile.className == "Start") {
                if (objects.start.length > 4) {
                    tiled.warn("PuzzleBoy.js: More than 4 start objects detected, the rest will be ignored.")
                    break;
                }
                
                var contents = {
                    "id": currentTile.property("Slot ID"),
                    "pos": [xNew, yNew],
                    "enabled": currentTile.property("Enabled"),
                };
                objects.start.push(contents)
            };
            if (currentTile.className == "Goal") {
                objects.goal = [xNew, yNew];
            };
        }
    }

    function mergeLayers(layers) {
        var mergedLayer = [];
        mergedLayer.length = map.width * map.height;
    
        // Sort the layers from bottom to top, to prepare for merging
        layers.sort(function(a, b){return a.id - b.id}); 
    
        for (let i = 0; i < layers.length; ++i) {
    
            const current = layers[i].grid;

            // Overwrite contents at index t if they exist
            for (let t = 0; t < current.length; ++t) {

                if (layers[i].grid[t] != "empty") {
                    var hexID = layers[i].id.toString(16).padStart(2, "0")
                    var contents = `0x${hexID}${current[t]}`
                    mergedLayer[t] = contents; 
                } 
                
            }
        }
    
        for (let tt = 0; tt < mergedLayer.length; ++tt) {
            if (mergedLayer[tt] === undefined) {
                mergedLayer[tt] = "0x0020"
            }
        }
    
        return(mergedLayer);
    }

    function exportFile() {

        function getEnabled(val, i, arr) {
            if (arr[i].enabled) {
                return val;
            }
        }

        var file = new BinaryFile(fileName, BinaryFile.WriteOnly);

        // Number of start positions
        var countStart = 0;
        for (let i = 0; i < objects.start.lenght; i++) {
            if (objects.start[i].enabled) {
                countStart++;
            }
        }
        var starts = objects.start.filter(getEnabled).length;
        if (starts == 0) {
            tiled.warn("PuzzleBoy.js: No enabled start objects found. This level is not playable.")
        }
        var startAmount = new Uint8Array([starts, 0, 0, 0]);
        file.write(startAmount.buffer);
    
        // Related to start positions
        var startEnabled = new Uint8Array(4);
        for (let index = 0; index < startEnabled.byteLength; index++) {
            if (objects.start[index] !== undefined) {
                if (objects.start[index].enabled == true) {
                    startEnabled[index] = 1;
                } else {
                    startEnabled[index] = 0;
                }
            } else {
                startEnabled[index] = 0;
            }
        }
        file.write(startEnabled.buffer);
        
        // Position in x/y coordinates of start objects
        var startPos = new Uint8Array(16)
        for (let index = 0; index < 4; index++) {
            if (objects.start[index] != null) {
                var offset = index * 4;
                startPos[offset] = objects.start[index].pos[0];
                startPos[offset + 2] = objects.start[index].pos[1];
            }
        }
        file.write(startPos.buffer);
        
        // Position in x/y coordinates of goal objects
        var goalPos = new Uint8Array([objects.goal[0], 0, objects.goal[1], 0]);
        file.write(goalPos.buffer);

        // Tile data
        var newArray = []
        for (var p = 0; p < gridData.length; ++p) { // Convert array to big endian
            var one = gridData[p].slice(2, 4)
            var two = gridData[p].slice(4)
            var newstr = `0x${two}${one}`
            newArray.push(newstr)
        }
        var tileArray = new Uint16Array(newArray);
        file.write(tileArray.buffer);
    
        file.commit();
    }
}

var customMapFormat = {
    name: "Puzzle Boy map",
    extension: 'map\.bytes',
    read: pbRead,
    write: pbWrite
}

tiled.registerMapFormat("pbmap", customMapFormat);

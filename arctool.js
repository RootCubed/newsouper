const fs = require("fs");

module.exports = {
    decompressU8,
    compressU8
}

function decompressU8(fileIn, outFolder) {
    processArc(fs.readFileSync(fileIn), outFolder);
}

function compressU8(inDir, outFile) {
    // convert from folder to arc

    if (!fs.lstatSync(inDir).isDirectory()) {
        throw "input folder must be a directory path";
    }

    // human-readable format
    let fileList = createFileList(inDir);

    // add root
    fileList.unshift({
        type: "folder",
        name: "",
        size: fileList.length + 1
    });

    // change offsets
    for (let f = 0; f < fileList.length; f++) {
        if (fileList[f].type == "folder") {
            fileList[f].size += f;
        }
    }

    // string table
    let stringTable = "";
    for (f of fileList) {
        let nameWithoutPath = f.name.split("/");
        nameWithoutPath = nameWithoutPath[nameWithoutPath.length - 1];
        stringTable += nameWithoutPath + '\0';
        f.nameWithoutPath = nameWithoutPath;
    }

    // count file size
    let fSize = 0;
    for (file of fileList) {
        if (file.type == "file") {
            fSize += file.size;
        }
    }
    let arcSize = Math.ceil((0x20 + 0xC * fileList.length + stringTable.length) / 0x20) * 0x20 + fSize;

    let finalFile = new Uint8Array(arcSize);

    // headers
    const tag = hexToArray("55aa382d", 4);
    const rootNodeOffset = hexToArray(0x20, 4);

    const numHeaderSize = 12 * fileList.length + stringTable.length;
    const headerSize = hexToArray(numHeaderSize, 4);

    const numDataOffset = Math.ceil((0x20 + numHeaderSize) / 0x20) * 0x20;
    const dataOffset = hexToArray(numDataOffset, 4);
    finalFile.set(tag, 0);
    finalFile.set(rootNodeOffset, 4);
    finalFile.set(headerSize, 8);
    finalFile.set(dataOffset, 12);

    // nodes
    let filePos = 0x20;
    let dataPos = numDataOffset;
    let stringTablePos = 0;
    for (f of fileList) {
        let nType = hexToArray((f.type == "folder") ? 1 : 0, 1);

        let nStrOffset = hexToArray(stringTablePos, 3);

        while (stringTable[stringTablePos++] !== '\0') {}

        let nDatOffset;
        if (f.type == "file") {
            nDatOffset = hexToArray(dataPos, 4);
        } else {
            // find parent directory index
            let parentIndex = 0;
            if (f.name != "") {
                while (parentIndex < fileList.length) {
                    let thisName = fileList[parentIndex].name;
                    if (thisName == "") thisName = inDir;
                    if (f.name.replace("/" + f.nameWithoutPath, "") == thisName) break;
                    parentIndex++;
                }
            }
            nDatOffset = hexToArray(parentIndex, 4);
        }

        let nSize = hexToArray(f.size, 4);

        // write file
        finalFile.set(nType, filePos);
        finalFile.set(nStrOffset, filePos + 1);
        finalFile.set(nDatOffset, filePos + 4);
        finalFile.set(nSize, filePos + 8);
        if (f.type == "file") {
            let file = fs.readFileSync(f.name);
            console.log(dataPos + "/" + arcSize);
            finalFile.set(file, dataPos);
            dataPos += f.size;
        }
        filePos += 12;
    }

    // write string table
    let hexStringTable = [];
    for (let i = 0; i < stringTable.length; i++) {
        hexStringTable.push(stringTable.charCodeAt(i));
    }
    finalFile.set(hexStringTable, filePos);

    fs.writeFileSync(outFile, finalFile);
}

function processArc(data, name) {
    let binary = new Uint8Array(data);
    // archive header
    if (!(binary[0] == 0x55 && binary[1] == 0xAA && binary[2] == 0x38 && binary[3] == 0x2D)) {
        throw "This file was not recognized as a valid ARC/U8 archive.";
    }
    let _rootNodeOffset = makeUint(binary, 4, 8);
    let headerSize = makeUint(binary, 8, 12);
    let _dataOffset = makeUint(binary, 12, 16);

    // 16 hex zeroes

    // file nodes
    let pos = 0x20;
    let nodes = [];
    while (!nodes[0] || nodes.length < nodes[0].size) {
        let node = {};
        node.nodeType = binary[pos];
        pos++;
        node.nameOffset = makeUint(binary, pos, pos + 3); // "uint24"
        pos += 3;
        node.dataOffset = makeUint(binary, pos, pos + 4);
        pos += 4;
        node.size = makeUint(binary, pos, pos + 4);
        pos += 4;

        nodes.push(node);
    }

    // name strings
    let nS = makeString(binary, pos, 0x20 + headerSize);
    let names = [];
    for (let n = nodes.length - 1; n >= 0; n--) {
        names.unshift(nS.substring(nodes[n].nameOffset, nS.length - 1)); // -1 to compensate for the null byte
        nS = nS.substring(0, nodes[n].nameOffset);
    }

    // actual files
    let currPath = [name];
    let nextGoBack = [nodes.length];
    for (let n = 0; n < nodes.length; n++) {
        let node = nodes[n];
        if (nextGoBack[nextGoBack.length - 1] == n) {
            currPath.pop();
            nextGoBack.pop();
        }
        if (node.nodeType == 1) {
            currPath.push(names[n]);
            nextGoBack.push(node.size);
            fs.mkdirSync(currPath.join("/"), {recursive: true});
            continue;
        }
        let f = new Uint8Array(node.size);
        for (let i = node.dataOffset; i < node.dataOffset + node.size; i++) {
            f[i - node.dataOffset] = binary[i];
        }
        let fileBuffer = Buffer.from(f);
        console.log(names[n]);
        fs.writeFileSync(currPath.join("/") + "/" + names[n], fileBuffer);
    }

}

function makeUint(array, start, end) {
    if (end <= start) throw "The programmer made an oopsie, tell him if you see this!";
    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += (array[i] << 8 * (end - i - 1));
    }
    return sum;
}

function makeString(array, start, end) {
    if (end <= start) throw "The programmer made an oopsie, tell him if you see this!";
    let str = "";
    for (let i = start; i < end; i++) {
        str += String.fromCharCode(array[i]);
    }
    return str;
}

function hexToArray(input, length) {
    let array = [];
    if (!input.substring) {
        // input is not a string
        input = input.toString(16);
    }
    for (let i = 0; i < length; i++) {
        let curr = parseInt(("00" + input).substring(input.length), 16);
        input = input.substring(0, (input.length >= 2) ? input.length - 2 : 0);
        array.unshift(curr);
    }
    return array;
}

function createFileList(fileDir) {
    let files = fs.readdirSync(fileDir);

    let fL = [];
    let currPos = 0;

    while (files.length > 0) {
        let file = files.pop();
        let currPath = fileDir + "/";

        if (fs.statSync(currPath + file).isDirectory()) {
            let addFiles = createFileList(currPath + file);
            fL.push({
                type: "folder",
                name: currPath + file,
                size: currPos + addFiles.length + 1
            });
            fL = fL.concat(addFiles);
        } else {
            fL.push({
                type: "file",
                name: currPath + file,
                size: fs.lstatSync(currPath + file).size
            });
        }
    }
    return fL;
}
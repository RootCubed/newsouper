#!/usr/bin/env node

const fs = require("fs");
const { execSync } = require("child_process");

let projectFName = process.argv[2];

if (projectFName == undefined || !fs.existsSync(projectFName)) {
    console.log("Please specify a project file.");
    process.exit();
}

let projectParsed;
try {
    projectParsed = JSON.parse(fs.readFileSync(projectFName));
} catch (e) {
    console.log("The project file is invalid. Please make sure it contains valid JSON syntax.");
    process.exit();
}

if (!fs.existsSync("tmp")) {
    fs.mkdirSync("tmp");
}
if (!fs.existsSync("export")) {
    fs.mkdirSync("export");
}
if (!fs.existsSync("export/riivolution")) {
    fs.mkdirSync("export/riivolution");
}

console.log("converting offsets to other versions");
projectParsed = convertVersions(projectParsed);

let projectName = projectFName;
let displayName = projectFName;

compile("EU_1");
compile("EU_2");
compile("US_1");
compile("US_2");

fs.copyFileSync(__dirname + "/Loader.S", "tmp/Loader.S");
compileAsm("tmp/Loader.S", "0x803482C0", "export/" + projectName + "/Loader.bin");

let xml = fs.readFileSync(__dirname + "/NSMBWTemplate.xml").toString().replace(/!name!/g, projectName).replace(/!dispname!/g, displayName);
fs.writeFileSync("export/riivolution/" + projectName + ".xml", xml);

function compile(region) {
    console.log("compiling " + region + ":");
    let patchBinary = [];
    let currAddr = 0x80C00000;
    for (let modObj of projectParsed) {
        switch (modObj.type) {
            case "projName":
                projectName = modObj.name;
                displayName = modObj.display;
                if (!fs.existsSync("export/" + projectName)) {
                    fs.mkdirSync("export/" + projectName);
                }
                if (!fs.existsSync("export/" + projectName + "/Patches")) {
                    fs.mkdirSync("export/" + projectName + "/Patches");
                }
                break;
            case "file": {
                let file = fs.readFileSync(modObj.name + ".S");
                for (let patch of modObj.hooks) {
                    console.log(" -" + patch.name);
                    // first, figure out the code of the jump to be performed
                    let offsetCAddr = hex(currAddr, -0x80000000);
                    let patchCAddr = parseInt(patch[region]) - 0x80000000;
                    let fileWithJump = 
`.org ${hex(patchCAddr, 0)}
${patch.type} ${patch.name}
.org ${offsetCAddr}
${file}`;
                    fs.writeFileSync("tmp/file.S", fileWithJump);
                    compileAsm("tmp/file", hex(patchCAddr, 0), "tmp/out.bin");
                    let jmp = fs.readFileSync("tmp/out.bin").subarray(patchCAddr, patchCAddr + 4);
                    // write that to the binary
                    patchBinary.push(...intToArray(parseInt(patch[region]))); // address to patch
                    patchBinary.push(0x00, 0x00, 0x00, 0x04); // length of patch (in this case always 4)
                    patchBinary.push(...jmp); // code (in this case, the jump code)
                }
                // now, compile the actual file and include it in the patch binary
                compileAsm(modObj.name, hex(currAddr, -0x80000000), "tmp/out.bin");
                let compiledAsm = fs.readFileSync("tmp/out.bin");
                patchBinary.push(...intToArray(currAddr)); // address to patch
                patchBinary.push(...intToArray(compiledAsm.length)); // length of patch (in this case always 4)
                patchBinary.push(...compiledAsm); // code (in this case, the jump code)
                currAddr += compiledAsm.length;
            }  
        }
    }
    fs.writeFileSync(`export/${projectName}/Patches/Code${region}.bin`, Buffer.from(patchBinary));
}

function intToArray(num) {
    let res = new Uint8Array(4);
    res[0] = (num & 0xFF000000) >> 24;
    res[1] = (num & 0x00FF0000) >> 16;
    res[2] = (num & 0x0000FF00) >> 8;
    res[3] = (num & 0x000000FF) >> 0;
    return res;
}

function hex(num, offs) {
    return "0x" + (parseInt(num) + offs).toString(16).padStart(8, "0");
}

function compileAsm(n, addr, out) {
    execSync(`powerpc-eabi-as -mregnames ${n} -o ${n}.o && powerpc-eabi-ld -T addresses.x -Ttext ${addr} --oformat binary ${n}.o -o ${out} && rm ${n}.o`);
}

function convertVersions(patches) {
    for (let modObj of projectParsed) {
        if (modObj.type == "file") {
            for (let patch of modObj.hooks) {
                 // TODO: Add more supported regions!
                patch.EU_2 = EU2(patch.EU_1);
                patch.US_1 = US1(patch.EU_1);
                patch.US_2 = US2(patch.EU_1);
            }
        }
    }
    return patches;
}

function EU2(offs) {
    if (offs >= 0x800CF6E8 && offs <= 0x800CF90F) return offs + 0x8;
    if (offs >= 0x807685A0 && offs <= 0x807AAA70) return offs + 0x40;
    if (offs >= 0x807AAA74 && offs <= 0x809907FF) return offs + 0x10;
    if (offs >= 0x80990800) return offs + 0x20;
    return offs;
}

function US1(offs) {
    // .text section
	if (offs >= 0x800B4604 && offs <= 0x800C8E4C) return offs - 0x50;
	if (offs >= 0x800C8E50 && offs <= 0x800E4D70) return offs - 0xF0;
	if (offs >= 0x800E4EC0 && offs <= 0x8010F200) return offs - 0x110;
	if (offs >= 0x8010F430 && offs <= 0x802BB6BC) return offs - 0x140;
	if (offs >= 0x802BB6C0 && offs <= 0x802BB74C) return offs - 0x150;
	if (offs >= 0x802BB860 && offs <= 0x802BBBFC) return offs - 0x260;
	if (offs >= 0x802BBC90 && offs <= 0x802EDCC0) return offs - 0x2F0;

	// .ctors, .dtors, .rodata, part of .data section
	if (offs >= 0x802EDCE0 && offs <= 0x80317734) return offs - 0x300;

	// .data section
	if (offs >= 0x80317750 && offs <= 0x80322FE0) return offs - 0x318;
	if (offs >= 0x80323118 && offs <= 0x8032E77C) return offs - 0x348;
	if (offs >= 0x8032E780 && offs <= 0x8035197C) return offs - 0x340;

	// .sdata section, part of .sbss
	if (offs >= 0x80351980 && offs <= 0x80427E87) return offs - 0x300;

	// .sbss, .sdata2, .sbss2 sections
	if (offs >= 0x80427E88 && offs <= 0x80429563) return offs - 0x310;
	if (offs >= 0x80429564 && offs <= 0x80429D7F) return offs - 0x2F8;
	if (offs >= 0x80429D80 && offs <= 0x807684BF) return offs - 0x2E0;

	// part of d_basesNP, d_enemiesNP, d_en_bossNP
	if (offs >= 0x8098A43C) return offs + 0x20;

	return offs;
}

function US2(offs) {
    offs = US1(offs)

	if (offs >= 0x800CF5F8 && offs <= 0x800CF81F) return offs + 0x8;
	if (offs >= 0x807685A0 && offs <= 0x807AAA70) return offs + 0x40;
	if (offs >= 0x807AAA74 && offs <= 0x8099081C) return offs + 0x10;
	if (offs >= 0x80990820) return offs + 0x20;

	return offs;
}
#!/usr/bin/env node

const fs = require("fs-extra");
const { execSync } = require("child_process");

const loaderLocation = "0x80001810";
const converters = {
    "EU_1": EU1,
    "EU_2": EU2,
    "US_1": US1,
    "US_2": US2
}

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

let projectName = projectParsed.name;

if (!fs.existsSync("export/" + projectName)) {
    fs.mkdirSync("export/" + projectName);
}
if (!fs.existsSync("export/" + projectName + "/Patches")) {
    fs.mkdirSync("export/" + projectName + "/Patches");
}
if (fs.existsSync("tmp")) {
    fs.removeSync("tmp");
}
fs.mkdirSync("tmp");

let displayName;
for (let patch of projectParsed.patches) {
    displayName = patch.name;
    compileFiles(patch.files);
    for (let region in converters) {
        console.log("compiling for " + region + ":");
        let patchBinary = [];
        translateSymbols(patch.symbolFile, region, `tmp/addresses_${region}.x`);
        link(patch.files, `tmp/addresses_${region}.x`);
        // add the compiled assembly to the patch file
        let compiledAsm = fs.readFileSync("tmp/compiled.bin");
        patchBinary.push(...intToArray(0x80C00000)); // address to patch
        patchBinary.push(...intToArray(compiledAsm.length)); // length of patch
        patchBinary.push(...compiledAsm); // code
        // then we generate the branches and the nop patches and add them too
        let symbols = fs.readFileSync("tmp/map.txt").toString();
        for (let hook of patch.hooks) {
            console.log(" -" + hook.name);
            let patchAddress = converters[region](parseInt(hook.EU_1));
            let code = [0, 0, 0, 0];

            if (hook.type == "nop") {
                code = [0x60, 0x00, 0x00, 0x00];
            } else {
                let address = symbols.match(new RegExp(`0x[0-9, a-f, A-F]{16}(?=.+${hook.name})`, "g"));
                if (address == null) {
                    console.log(`Symbol ${hook.name} not found. Make sure you declared it globally if you used assembler!`);
                    continue;
                }
                code = intToArray(hookBranch(patchAddress, parseInt(address[0], 16), hook.type));
            }
            patchBinary.push(...intToArray(patchAddress)); // address to patch
            patchBinary.push(0x00, 0x00, 0x00, 0x04); // length of patch (in this case always 4)            
            patchBinary.push(...code); // code
        }
        fs.writeFileSync(`export/${projectName}/Patches/Code${region}.bin`, Buffer.from(patchBinary));
    }
}

fs.copyFileSync(__dirname + "/Loader.S", "tmp/Loader.S");
compileAsm("tmp/Loader.S", loaderLocation, "export/" + projectName + "/Loader.bin");

let xml = fs.readFileSync(__dirname + "/NSMBWTemplate.xml").toString().replace(/!name!/g, projectName).replace(/!dispname!/g, displayName);
fs.writeFileSync("export/riivolution/" + projectName + ".xml", xml);

function compileFiles(files) {
    for (let f of files) {
        execSync(`powerpc-eabi-gcc -I. -Os -fno-builtin -nodefaultlibs -fno-exceptions -mregnames -c -o tmp/${f}.o ${f}`);
    }
}

function link(files, symbolFile) {
    execSync(`powerpc-eabi-gcc -Wl,-Map -Wl,tmp/map.txt -nostartfiles -Wl,--oformat=binary -o tmp/compiled.bin -T ${symbolFile} ${files.reduce((acc, cur) => `${acc} tmp/${cur}.o`, "")}`);
}

function translateSymbols(file, region, out) {
    let symbols = fs.readFileSync(file).toString().match(/\w+.*=.*\w+/g);
    symbols = symbols.map(sym => {
        sym = sym.split(/\s*=\s*/g);
        sym[1] = "0x" + converters[region](parseInt(sym[1], 16)).toString(16);
        sym = sym.join(" = ");
        return sym;
    });
    fs.writeFileSync(out, `SECTIONS {\n\t. = 0x80C00000;\n\t${symbols.join(";\n\t")};\n}`);
}

function hookBranch(from, to, type) {
    let addrModeBit = type.match("a") != null;
    let linkBit = type.match("l") != null;
    let distance = to - from;
    if (distance > 0x3FFFFFC) {
        console.log(`branch to big! (${from} -> ${to})`);
    }
    return 0x48000000 | (distance & 0x3FFFFFC) | addrModeBit << 1 | linkBit;
}

function intToArray(num) {
    let res = new Uint8Array(4);
    res[0] = (num & 0xFF000000) >> 24;
    res[1] = (num & 0x00FF0000) >> 16;
    res[2] = (num & 0x0000FF00) >> 8;
    res[3] = (num & 0x000000FF) >> 0;
    return res;
}

function compileAsm(n, addr, out) {
    execSync(`powerpc-eabi-as -mregnames ${n} -o ${n}.o && powerpc-eabi-ld -T addresses.x -Ttext ${addr} --oformat binary ${n}.o -o ${out} && rm ${n}.o`);
}

function EU1(offs) {
    return offs;
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
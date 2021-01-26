#!/usr/bin/env node

const fs = require("fs-extra");
const { execSync, exec } = require("child_process");

const u8 = require("./arctool");

const loaderLocation = "0x80001810";
const converters = {
    "EU_1": EU1,
    "EU_2": EU2,
    "US_1": US1,
    "US_2": US2
}

let projectFName = process.argv[2];

if (!projectFName || !fs.existsSync(projectFName)) {
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

let isoName = process.argv[3];
let alreadyExtraced = fs.existsSync("gamefiles");
if (process.argv[4] == "--export" && !alreadyExtraced) {
    if (!fs.existsSync(process.argv[3])) {
        console.log("The specified ISO file does not exists. Make sure you typed the path correctly!");
        process.exit();
    } else {
        console.log("Extracting " + isoName + "...");
        fs.copyFileSync(isoName, "tmp/game.iso");
        if (fs.existsSync("gamefiles")) {
            fs.removeSync("gamefiles");
        }
        execSync("wit x tmp/game.iso gamefiles/");
    }
}

let displayName;
for (let patch of projectParsed.patches) {
    displayName = patch.name;
    console.log("Compiling source code");
    compileFiles(patch.files);
    linkFiles(patch);
    console.log("Generating patched files:");
    doFilePatches(patch.filePatches);
}

fs.copyFileSync(__dirname + "/Loader.S", "tmp/Loader.S");
compileAsm("tmp/Loader.S", loaderLocation, "export/" + projectName + "/Loader.bin");

let xml = fs.readFileSync(__dirname + "/NSMBWTemplate.xml").toString().replace(/!name!/g, projectName).replace(/!dispname!/g, displayName);
fs.writeFileSync("export/riivolution/" + projectName + ".xml", xml);

if (process.argv[4] == "--export") {
    if (!alreadyExtraced) {
        console.log("Something went wrong while exporting.");
        process.exit(0);
    }
    fs.emptyDirSync("export/PatchedISO");
    fs.copySync("gamefiles", "export/PatchedISO");
    exec(`wit dolpatch export/PatchedISO/sys/main.dol -o new=text,80001810,800 xml=export/riivolution/${projectName}.xml -s export/${projectName}`);
    if (!fs.existsSync("export/PatchedISO/files/Patches")) {
        fs.mkdirSync("export/PatchedISO/files/Patches");
    }
    fs.copySync(`export/${projectName}/Patches`, "export/PatchedISO/files/Patches");
    fs.copySync(`export/${projectName}/Files`, "export/PatchedISO/files");
}

function linkFiles(patch) {
    for (let region in converters) {
        console.log("Building for " + region + ":");
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
            } else if (hook.type == "instr") {
                code = hook.instr.match(/.{1,2}(?=(.{2})+(?!.))|.{1,2}$/g); // split every 2 chars
            } else if (hook.type == "pointer") {
                let address = symbols.match(new RegExp(`0x[0-9, a-f, A-F]{16}(?=.+${hook.name})`, "g"));
                if (address == null) {
                    console.log(`Symbol ${hook.name} not found. Make sure you declared it globally if you used assembler!`);
                    continue;
                }
                code = intToArray(parseInt(address[0], 16));
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

function doFilePatches(patches) {
    for (let fPatch of patches) {
        if (!fPatch.file) {
            console.log("No input file specified!");
            continue;
        } else {
            if (fPatch.type == "getoriginalfile") {
                // leave file as-is
            } else if (fPatch.file[0] != '!') {
                fPatch.file = "tmp/" + fPatch.file;
            } else {
                fPatch.file = fPatch.file.substring(1);
            }
        }

        if (!fPatch.out) {
            console.log("No output file specified!");
            continue;
        } else {
            if (fPatch.out[0] != '!') {
                fPatch.out = "tmp/" + fPatch.out;
            } else {
                fPatch.out = fPatch.out.substring(1);
            }
        }

        switch(fPatch.type) {
            case "getoriginalfile":
                console.log(` -getoriginalfile: ${fPatch.file} -> ${fPatch.out}`);
                if (!alreadyExtraced) {
                    if (!isoName) {
                        console.log("No ISO file was specified, but it is needed for file patching. Please make sure the third argument is a path to an ISO file.");
                        process.exit(0);
                    }
                    console.log("Extracting " + isoName + " for file patches...");
                    fs.copyFileSync(isoName, "tmp/game.iso");
                    if (fs.existsSync("gamefiles")) {
                        fs.removeSync("gamefiles");
                    }
                    execSync("wit x tmp/game.iso gamefiles/");
                }
                fs.copyFileSync("gamefiles/files/" + fPatch.file, fPatch.out);
                break;
            case "arcdecompress":
                console.log(` -arcdecompress: ${fPatch.file} -> ${fPatch.out}`);
                u8.decompressU8(fPatch.file, fPatch.out);
                break;
            case "arccompress":
                console.log(` -arccompress: ${fPatch.file} -> ${fPatch.out}`);
                u8.compressU8(fPatch.file, fPatch.out);
                break;
            case "copyfolder":
                console.log(` -copyfolder: ${fPatch.file} -> ${fPatch.out}`);
                if (fs.existsSync(fPatch)) {
                    console.log(`Error: Folder ${fPatch.out} already exists. Make sure you use different names when copying files!`);
                    break;
                }
                fs.copySync(fPatch.file, fPatch.out);
                break;
            case "compilebenzin":
                console.log(` -compilebenzin: ${fPatch.file} -> ${fPatch.out}`);
                execSync(`benzin m ${fPatch.file} ${fPatch.out}`, function (err, stdout) {
                    console.log(err);
                    console.log(stdout);
                });
                break;
        }
        if (fPatch.export) {
            let trimmedFName = fPatch.out.split("/");
            trimmedFName = trimmedFName[trimmedFName.length - 1];
            console.log(` -exporting: ${fPatch.out} -> ${`export/${projectName}/Files/${fPatch.export}/${trimmedFName}`}`);
            fs.outputFileSync(`export/${projectName}/Files/${fPatch.export}/${trimmedFName}`, fs.readFileSync(fPatch.out));
        }
    }
}

function translateSymbols(file, region, out) {
    let symbols = fs.readFileSync(file).toString().match(/\w+.*=.*\w+/g);
    symbols = symbols.map(sym => {
        sym = sym.split(/\s*=\s*/g);
        sym[1] = "0x" + converters[region](parseInt(sym[1], 16)).toString(16);
        sym = sym.join(" = ");
        return sym;
    });
    fs.writeFileSync(out, `
SECTIONS {
    . = 0x80C00000;
    ${symbols.join(";\n\t")};
}`);
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

function compileFiles(files) {
    for (let f of files) {
        execSync(`powerpc-eabi-gcc -I. -IC:\\devkitPro\\libogc\\include -Os -fno-builtin -fno-exceptions -mregnames -c -o tmp/${f}.o ${f}`);
    }
}

function link(files, symbolFile) {
    execSync(`powerpc-eabi-gcc -Wl,-Map,tmp/map.txt -nolibc -Wl,-V -nostartfiles -Wl,--oformat=binary -o tmp/compiled.bin -T ${symbolFile} ${files.reduce((acc, cur) => `${acc} tmp/${cur}.o`, "")} -LC:\\devKitPro\\libogc\\lib\\wii -logc`);
}

function compileAsm(n, addr, out) {
    execSync(`powerpc-eabi-as -mregnames ${n} -o ${n}.o && powerpc-eabi-ld -T addresses.x -Ttext ${addr} --oformat binary ${n}.o -o ${out}`);
    fs.removeSync(`tmp/${n}.o`);
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
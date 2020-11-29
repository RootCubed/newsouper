# NewSouper
A Riivolution mod builder for New Super Mario Bros. Wii code hacks.

## Installation
`$ npm i -g newsouper`

You will also need the PowerPC assembler and linker, which you can download [here](https://devkitpro.org/wiki/Getting_Started) (make sure to select 'Wii Development' during the installation). You might need to add the binaries to your path.
To build a project that modifies layouts, you will need to download Benzin from [here](https://wiibrew.org/wiki/Benzin) and add it to your PATH.

## Usage
In the folder with your project:
`nsoup <project>.json`

## Project file structure
Your project will consist of the following files:

* Project file
* Symbol file for linker
* Any number of code files to be compiled

### Project file
This is the file that tells the builder the display name of the mod in Riivolution, which assembly files to use and gives information about the hooks (the address and which branch instruction to use).
The file is in the JSON format, containing an object with the keys "name" and "patches".

### root object
* name (string): The name of the folder which will go on your SD card for your Wii.
* patches (array of patches): The patches to be compiled. NOTE: Currently, only one patch at a time is supported.

### patch
* name (string): The name to be shown in Riivolution.
* files (array of string): The paths to the source files to be compiled. These can be .S (assembly), .c or .cpp files.
* hooks (array of hooks): Contains all hooks related to the file referenced in the parent object.
* filePatches (array of fPatches): Contains a sequential list of actions to perform to modify various files like layouts or models.

### hook (type: b, bl, ba, bla)
* name (string): Name of the function to hook to
* EU_1 (string): The hexadecimal representation of the location of the instruction to be replaced with the hook.

### hook (type: nop)
* name (string): Name of the patch
* EU_1 (string): The hexadecimal representation of the location of the instruction to be NOPed.

### fPatch
An fPatch has a type parameter, a file parameter for selecting a file or folder to perform the action an, and, depending on the type, an out parameter.
Any fPatch can specify an export property with the path to where the resulting file will be placed in the mod folder.

If an exclamation mark is placed before the filename, the file is relative to the project folder. Otherwise, it will be relative to the tmp folder that is creating during the building process.

The following types are currently supported:
* arcdecompress: decompresses `file` to the folder `out`.
* arccompress: compresses the folder `file` to the file `out`.
* compilebenzin: converts an input XMLYT `file` to a BRLYT file `out`.

## Example project file
```json
{
	"name": "SpeedrunTimer",
	"patches": [
		{
			"name": "Speedrun Timer",
			"symbolFile": "addresses.x",
			"files": ["timer.S", "functions.c"],
			"hooks": [
				{
					"name": "HookTimerText",
					"type": "b",
					"EU_1": "0x80159C20"
				},
				{
					"name": "alwaysChangeTime",
					"type": "nop",
					"EU_1": "0x80159C08"
				},
				{
					"name": "resetCounter",
					"type": "b",
					"EU_1": "0x8005E05C"
				}
			],
			"filePatches": [
				{
					"type": "arcdecompress",
					"file": "!gameScene.arc",
					"out": "gameScene"
				},
				{
					"type": "compilebenzin",
					"file": "!gameScene_37.xmlyt",
					"out": "gameScene/arc/blyt/gameScene_37.brlyt"
				},
				{
					"type": "arccompress",
					"file": "gameScene",
					"out": "gameScene.arc",
					"export": "Layout/gameScene"
				}
			]
		}
	]
}
```

### Symbol file for linker
This file contains the symbols that you can use in the assembly files. The format is the following:
```
SECTION {
    <symbol_name> = 0xDEADBEEF;
}
```

### Code files
PowerPC assembly and C(++) source files are supported.

## Projects using newsouper

[BetterIGT](https://github.com/LetsPlentendo-CH/BetterIGT), a mod that makes the in-game timer have three decimal places.
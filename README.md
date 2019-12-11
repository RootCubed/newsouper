# NewSouper
A Riivolution mod builder for New Super Mario Bros. Wii code hacks.

## Installation
`$ npm i -g newsouper`

You will also need the PowerPC assembler and linker, which you can download [here](https://devkitpro.org/wiki/Getting_Started) (make sure to select 'Wii Development' during the installation). You might need to add the binaries to your path.

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
* files (array of string): The paths to the source files to be compiled
* hooks (array of hooks): Contains all hooks related to the file referenced in the parent object.

### hook (type: b, bl, ba, bla)
* name (string): Name of the function to hook to
* EU_1 (string): The hexadecimal representation of the location of the instruction to be replaced with the hook.

### hook (type: nop)
* name (string): Name of the patch
* EU_1 (string): The hexadecimal representation of the location of the instruction to be NOPed.

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
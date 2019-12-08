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
The file is in the JSON format, containing an array of objects.
On the top level, each object must contain the key 'type', whose value must either be `file` or `projName`.

### Symbol file for linker
This file contains the symbols that you can use in the assembly files. The format is the following:
```
SECTION {
    <symbol_name> = 0xDEADBEEF;
}
```

### Code files
Currently, only the PowerPC assembly language is supported, C(++) support is being worked on.

## Objects in the project file

### file
* name (string): The name of the folder which will go on your SD card for your Wii.
* display (string): The title of the mod, which will be shown in Riivolution.

### projName
* name (string): The name of the assembly file to be loaded (currently, only .S files are supported)
* hooks (hook[]): Contains all hooks related to the file referenced in the parent object.

### hook (type: b, bl, beq,...)
* name (string): Name of the function to hook to
* EU_1 (string): The hexadecimal representation of the location of the instruction to be replaced with the hook.

### hook (type: single_instr)
* name (string): Name of the patch
* EU_1 (string): The hexadecimal representation of the location of the instruction to be replaced with the instruction.
* instruction (string): The code fragment to be placed at the location specified in EU_1

## Example project file
```json
[
  {
    "name": "ShakeWithB",
    "display": "Shake With B",
    "type": "projName"
  },
  {
    "name": "shakeWithB.S",
    "type": "file",
    "hooks": [
      {
        "name": "shakeWithB",
        "type": "b",
        "EU_1": "0x8005E780"
      }
    ]
  }
]
```
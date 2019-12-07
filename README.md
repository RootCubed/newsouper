# NewSouper
A Riivolution mod builder for New Super Mario Bros. Wii code hacks.

## How to run
This project was made with node.js, so go ahead and download that. Then go into this directory and run `npm install -g .`, which will install the tool globally, so that you can build mods anywhere on your PC.
Run the program in your mod folder with the following command:
`nsoup <project>.json`

## File structure
Your project will consist of the following files:

* Project file
* Address name file for linker
* a number of assembly files to be compiled

### Project file
This is the file that tells the builder the display name of the mod in Riivolution, which assembly files to use and gives information about the hooks (the address and which branch instruction to use).
The file is in JSON format, containing an array of objects.
On the top level, the object must contain a type, which will either be `file` or `projName`.

#### file
* name (string): The name of the folder which contains the binaries.
* display (string): The title of the mod, which will be shown in Riivolution

#### projName
* name (string): The name of the assembly file (without file extension, as it can only be .S in the current version)
* hooks (array): Contains all hooks related to the file referenced in the parent object. Each object in the array must contain:
    * name (string): Name of the function to hook to
    * type (string): Type of branch to use (currently supported: b and bl)
    * EU_1 (string): The hexadecimal representation of the location of the instruction to be replaced with the hook.
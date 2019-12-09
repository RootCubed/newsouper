.macro callSysFunction offset
    lwz r12, \offset(r31)
    mtctr r12
    bctrl
.endm

# offsets in system function table
OSReport =                  0x4
OSFatal =                   0x8
DVDConvertPathToEntrynum =  0xC
DVDFastOpen =               0x10
DVDReadPrio =               0x14
DVDClose =                  0x18
HeapAlloc =                 0x1C
HeapFree =                  0x20
GameHeapArray =             0x24
ArchiveHeap =               0x28
sprintf =                   0x2C

TEST_REGION = 0x80768D50

.text
.global _start
_start:
    # prolog
    stwu r1, -0x60(r1)
    mflr r0
    stw r0, 0x64(r1)
    stw r31, 0x5C(r1)
    stw r30, 0x58(r1)
    stw r29, 0x54(r1)

    # assume current version to be 1
    li r6, 0x31
    lis r5, TEST_REGION@h
    ori r5, r5, TEST_REGION@l
    lwz r3, 0(r5) # read where bl to ~dStateMgrBase_c points to
    clrlwi r3, r3, 16 # get low 2 bytes
    cmpwi r3, 0x6DE1
    beq setEU
    cmpwi r3, 0x6CA1
    beq setUS
    cmpwi r3, 0x6AB1
    beq setJP

    # not version 1, is it v2?
    li r6, 0x32
    lwz r3, 0x40(r5)
    clrlwi r3, r3, 16
    cmpwi r3, 0x6DA1
    beq setEU
    cmpwi r3, 0x6C61
    beq setUS
    cmpwi r3, 0x6A71
    beq setJP
    b panic

setEU:
    lis r31, EUAddr@h
    ori r31, r31, EUAddr@l
    b regionDetected
setUS:
    lis r31, USAddr@h
    ori r31, r31, USAddr@l
    b regionDetected
setJP:
    lis r31, JPAddr@h
    ori r31, r31, JPAddr@l
    b regionUnsupportedError

regionDetected:
    bl insertRegionIntoFileName
    lis r3, PatchLocation@h
    ori r3, r3, PatchLocation@l
    callSysFunction DVDConvertPathToEntrynum
    cmpwi r3, -1
    beq fileMissingError
    addi r4, r1, 8
    callSysFunction DVDFastOpen
    cmpwi r3, 1
    bne fileOpenError
    addi r3, r1, 8
    lis r4, 0x80BC # location to write patch file to
    mr r30, r4
    lwz r5, 0x3C(r1)
    li r6, 0
    li r7, 2
    callSysFunction DVDReadPrio
    bl patch
    addi r3, r1, 8
    callSysFunction DVDClose
    b returnToGame

panic:
    b panic

regionUnsupportedError:
    lis r3, regionUnsupportedErrorText@h
    ori r3, r3, regionUnsupportedErrorText@l
    b panicWithMessage

fileMissingError:
    lis r3, fileMissingErrorText@h
    ori r3, r3, fileMissingErrorText@l
    b panicWithMessage

fileOpenError:
    lis r3, fileOpenErrorText@h
    ori r3, r3, fileOpenErrorText@l
    b panicWithMessage

errorAlloc:
    lis r3, errorAllocText@h
    ori r3, r3, errorAllocText@l
    b panicWithMessage

panicWithMessage:
    mr r5, r3
    lis r3, OSFatalData@h
    ori r3, r3, OSFatalData@l
    lis r4, OSFatalData@h + 4
    ori r4, r4, OSFatalData@l + 4
    callSysFunction OSFatal

returnToGame:
    li r3, 1
    lwz r31, 0x5C(r1)
    lwz r30, 0x58(r1)
    lwz r29, 0x54(r1)
    lwz r0, 0x64(r1)
    mtlr r0
    addi r1, r1, 0x60
    blr

insertRegionIntoFileName:
    lis r4, PatchLocation@h
    ori r4, r4, PatchLocation@l

    # E, U or J (1st char of region)
    lbz r5, 0(r31)
    stb r5, 0xD(r4)

    # U, S or P (2nd char of region)
    lbz r5, 1(r31)
    stb r5, 0xE(r4)

    # 1 or 2 (version)
    stb r6, 0x10(r4)
    blr

patch:
    mr r3, r30
    lwz r4, 0x3C(r1)
    add r4, r4, r3

nextPatch:
    lwz r5, 0(r3)
    lwz r6, 4(r3)
    addi r3, r3, 8
    add r6, r6, r3

patchBytes:
    lwz r7, 0(r3)
    stw r7, 0(r5)
    addi r3, r3, 4
    addi r5, r5, 4
    cmpw r3, r6
    blt patchBytes

doneBatch:
    cmpw r3, r4
    blt nextPatch
exit:
    blr
    
.align 4
EUAddr:
    .string "EU"
    .align 1
    .long 0x8015F870
    .long 0x801AF710
    .long 0x801CA7C0
    .long 0x801CAAD0
    .long 0x801CAC60
    .long 0x801CAB40
    .long 0x802B8E00
    .long 0x802B90B0
    .long 0x80377F48
    .long 0x8042A72C
    .long 0x802E1ACC
USAddr:
    .string "US"
    .align 1
    .long 0x8015F730
    .long 0x801AF5D0
    .long 0x801CA680
    .long 0x801CA990
    .long 0x801CAB20
    .long 0x801CAA00
    .long 0x802B8CC0
    .long 0x802B8F70
    .long 0x80377C48
    .long 0x8042A44C
    .long 0x802E17DC
JPAddr:
    .string "JP"
    .align 1
    .long 0x8015F540
    .long 0x801AF3E0
    .long 0x801CA490
    .long 0x801CA7A0
    .long 0x801CA930
    .long 0x801CA810
    .long 0x802B8AD0
    .long 0x802B8D80
    .long 0x803779C8
    .long 0x8042A16C
    .long 0x802E15EC
PatchLocation:
    .string "/Patches/CodeXX_x.bin"
OSFatalData:
    .long 0xFFFFFFFF
    .long 0x00000000

regionUnsupportedErrorText:
    .string "Sorry, this region is not supported yet."
fileMissingErrorText:
    .string "CodeEU_2.bin is missing or not in /Patches/"
fileOpenErrorText:
    .string "CodeEU_2.bin could not be opened"
errorAllocText:
    .string "Error allocating memory."
finishedPatchText:
    .string "Finished patching."

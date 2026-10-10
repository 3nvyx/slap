"use strict";
// Avatars as pixel art. One row of text per row of pixels: "#" is a lit pixel, "." is off.
// Every row of one avatar should be the same length. The screen is 128 wide and 64 tall,
// so an avatar taller than 64 rows cannot fit.
//
// To make one from a picture, use "Turn a picture into an avatar" on the page, then paste the result here.

sprite("robot", `
......####......
......#..#......
..############..
.#............#.
.#..##....##..#.
.#..##....##..#.
.#............#.
.#...######...#.
.#............#.
..############..
....##....##....
....##....##....
`);

sprite("ghost", `
....######....
..##########..
.############.
.###..##..###.
####..##..####
####..##..####
##############
##############
##############
##############
##############
##.###..###.##
#...##..##...#
`);

sprite("heart", `
.###...###.
#####.#####
###########
###########
.#########.
..#######..
...#####...
....###....
.....#.....
`);

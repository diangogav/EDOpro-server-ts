export const generateSeed = () => {
    const res: number[] = [];
    for (let i = 0; i < 8; i++) {
        res.push(Math.floor(Math.random() * 0x100000000));
    }
    return res;
};

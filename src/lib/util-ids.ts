export const uuidList = (a: string[]): string[] => a.filter((x) => /^[0-9a-f-]{36}$/i.test(x));

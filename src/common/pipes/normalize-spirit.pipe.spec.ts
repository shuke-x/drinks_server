import { NormalizeSpiritPipe } from "./normalize-spirit.pipe";

describe("NormalizeSpiritPipe", () => {
  const pipe = new NormalizeSpiritPipe();
  it("keeps dynamically managed category codes", () => {
    expect(pipe.transform("brandy")).toBe("brandy");
  });
  it("preserves legacy Chinese aliases", () => {
    expect(pipe.transform("金酒")).toBe("gin");
  });
});

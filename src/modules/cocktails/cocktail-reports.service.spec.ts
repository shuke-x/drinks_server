import { ConflictException, NotFoundException } from "@nestjs/common";
import { CocktailReportsService } from "./cocktail-reports.service";
import { CocktailStatus } from "./entities/cocktail.entity";

describe("CocktailReportsService", () => {
  const reports: any = { findOne: jest.fn(), create: jest.fn((value: any) => value), save: jest.fn((value: any) => ({ id: "report-1", status: "open", ...value })), find: jest.fn(), findOneBy: jest.fn() };
  const cocktails: any = { findOne: jest.fn() };
  const users: any = { findOneBy: jest.fn() };
  const blocks: any = { find: jest.fn(), exists: jest.fn() };
  const service = new CocktailReportsService(reports, cocktails, users, blocks);
  const reporter = { id: "reporter-1" };
  const cocktail = { id: "recipe-1", isOfficial: false, status: CocktailStatus.PUBLISHED, owner: { id: "creator-1" } };

  beforeEach(() => {
    jest.clearAllMocks();
    users.findOneBy.mockResolvedValue(reporter);
    cocktails.findOne.mockResolvedValue(cocktail);
    reports.findOne.mockResolvedValue(null);
    reports.save.mockImplementation((value: any) => ({ id: "report-1", status: "open", ...value }));
    blocks.find.mockResolvedValue([]);
  });

  it("stores a report against a published user recipe", async () => {
    await expect(service.create("reporter-1", "recipe-1", { reason: "privacy" }))
      .resolves.toMatchObject({ id: "report-1", alreadyReported: false });
    expect(reports.save).toHaveBeenCalledWith(expect.objectContaining({ reason: "privacy", reporter, cocktail }));
  });

  it("does not create duplicate reports for the same user and recipe", async () => {
    reports.findOne.mockResolvedValue({ id: "existing", status: "open" });
    await expect(service.create("reporter-1", "recipe-1", { reason: "spam" }))
      .resolves.toEqual({ id: "existing", status: "open", alreadyReported: true });
    expect(reports.save).not.toHaveBeenCalled();
  });

  it("rejects own recipes and official recipes", async () => {
    cocktails.findOne.mockResolvedValue({ ...cocktail, owner: reporter });
    await expect(service.create("reporter-1", "recipe-1", { reason: "spam" })).rejects.toBeInstanceOf(ConflictException);
    cocktails.findOne.mockResolvedValue({ ...cocktail, isOfficial: true });
    await expect(service.create("reporter-1", "recipe-1", { reason: "spam" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("filters blocked creators from paged feeds and checks detail access", async () => {
    blocks.find.mockResolvedValue([{ blocked: { id: "creator-1" } }]);
    const result = await service.filterBlocked("viewer-1", {
      data: [{ id: "recipe-1", publisher: { id: "creator-1" } }, { id: "recipe-2", publisher: { id: "creator-2" } }],
      meta: { total: 2 },
    });
    expect(result.data.map((item: any) => item.id)).toEqual(["recipe-2"]);
    blocks.exists.mockResolvedValue(true);
    await expect(service.isBlocked("viewer-1", "creator-1")).resolves.toBe(true);
  });
});

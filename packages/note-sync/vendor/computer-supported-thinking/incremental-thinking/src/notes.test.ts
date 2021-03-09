import processor from "./processor";
import { getNoteID, getNoteTitle } from "./notes";
import mdast from "mdast";

describe("finding note IDs", () => {
  describe("bear note IDs", () => {
    test("extracts bear note ID", () => {
      const testBearID =
        "860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA";
      const input = `# Test node

<!-- {BearID:${testBearID}} -->`;

      const tree = processor.runSync(processor.parse(input)) as mdast.Root;
      const noteID = getNoteID(tree);
      expect(noteID).toBeTruthy();
      expect(noteID!.id).toEqual(testBearID);
      expect(noteID!.openURL).toMatchInlineSnapshot(
        `"bear://x-callback-url/open-note?id=860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA"`
      );
    });
  });
});

describe("getting note title", () => {
  test("extracts title heading", () => {
    const input = `# Test node
    
Another paragraph`;
    const tree = processor.runSync(processor.parse(input)) as mdast.Root;
    expect(getNoteTitle(tree)).toEqual("Test node");
  });

  test("extracts title non-heading", () => {
    const input = `Non-heading title
    
More text`;
    const tree = processor.runSync(processor.parse(input)) as mdast.Root;
    expect(getNoteTitle(tree)).toEqual("Non-heading title");
  });

  test("doesn't extract non-title", () => {
    const tree = processor.runSync(processor.parse("")) as mdast.Root;
    expect(getNoteTitle(tree)).toBeNull();
  });
});

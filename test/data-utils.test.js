const assert = require("node:assert/strict");
const { test } = require("node:test");
const DataUtils = require("../src/utils/data-utils");
const FileUtils = require("../src/utils/file-utils");
const config = require("../src/config");

test("grouping handles special keys and sorting keeps equal values stable", () => {
  const values = [
    { k: "__proto__", n: 2 },
    { k: "a", n: 1 },
    { k: "a", n: 1 },
    { k: "a", n: null },
    { k: "a" },
  ];
  assert.equal(DataUtils.groupBy(values, "k").__proto__[0], values[0]);
  assert.deepEqual(DataUtils.sortBy(values, "n"), [
    values[1],
    values[2],
    values[0],
    values[3],
    values[4],
  ]);
});

test("sanitizing removes null and empty fields without mutating inputs or dropping zero", () => {
  const source = [{ name: "  ABC  ", a: null, b: "", c: 0 }];
  const result = DataUtils.sanitizeData(source, {
    name: "trim",
    a: "remove_null",
    b: "remove_null",
    c: "remove_null",
  });
  assert.deepEqual(result, [{ name: "ABC", c: 0 }]);
  assert.equal(source[0].name, "  ABC  ");
});

test("explicit JSON optimization removes empty values without changing the input", () => {
  const source = {
    data: [{ name: "City", optional: null, blank: "", count: 0 }],
  };
  const previous = config.OPTIMIZE_JSON;
  try {
    config.OPTIMIZE_JSON = true;
    assert.deepEqual(JSON.parse(FileUtils.minifyJSON(source)), {
      data: [{ name: "City", count: 0 }],
    });
    assert.equal(source.data[0].optional, null);
    assert.equal(
      JSON.parse(FileUtils.minifyJSON(source, { optimize: false })).data[0]
        .optional,
      null,
    );
  } finally {
    config.OPTIMIZE_JSON = previous;
  }
});

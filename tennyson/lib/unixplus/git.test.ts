import { expect, test } from 'vitest'
import * as git from "./git";

test("", () => {
  const url = "https://github.com/derailed/k9s";
  expect(git.GithubRepo.toURL(git.GithubRepo.ofURL(url)));
});

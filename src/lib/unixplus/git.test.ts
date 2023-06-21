import * as git from "./git";

it("", () => {
  const url = "https://github.com/derailed/k9s";
  expect(git.GithubRepo.toURL(git.GithubRepo.ofURL(url)));
});

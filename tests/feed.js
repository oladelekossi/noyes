window.likes = [];
window.nativeKeys = [];
window.addEventListener(
  "keydown",
  (event) => {
    if (["j", "k", "l", "n"].includes(event.key))
      window.nativeKeys.push(event.key);
  },
  true,
);
window.feedback = [];
window.openedMenus = [];
window.addEventListener("keyup", (event) => {
  if (event.key === "Escape") document.querySelector("[role=menu]")?.remove();
});
window.otherActions = [];
window.menuDelay = 0;
window.itemDelay = 0;
window.options = [
  "Not interested in this post",
  "Mute @example",
  "Block @example",
  "Report post",
];
window.addPost = ({
  id,
  text = "A thought worth sharing. Small tools can make everyday things feel a little easier.",
  name = "Alex",
  handle = "alex",
  options,
}) => {
  const post = document.createElement("article");
  post.dataset.testid = "tweet";
  post.innerHTML = `<div class="avatar" data-testid="Tweet-User-Avatar">${name[0]}</div><div class="post-body"><div class="header"><div data-testid="User-Name"><strong>${name}</strong><br><span class="handle">@${handle} · </span><a href="/${handle}/status/${id}"><time>2h</time></a></div><div class="caret-wrap"><button data-testid="caret" aria-label="More">···</button></div></div><p class="post-text">${text}</p><div class="actions"><button data-testid="like" aria-label="Like">♡ 24</button><span>↻ 3</span><span>▥ 842</span><span>↗</span></div></div>`;
  post.querySelector("[data-testid=like]").onclick = (event) => {
    const button = event.currentTarget;
    if (button.dataset.testid === "like") {
      window.likes.push(id);
      button.dataset.testid = "unlike";
      button.setAttribute("aria-label", "Unlike");
    } else {
      window.likes = window.likes.filter((key) => key !== id);
      button.dataset.testid = "like";
    }
  };
  post.querySelector("[data-testid=caret]").onclick = () =>
    setTimeout(() => {
      window.openedMenus.push(id);
      document.querySelector("[role=menu]")?.remove();
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      document.body.append(menu);
      setTimeout(
        () =>
          (options || window.options).forEach((label) => {
            const item = document.createElement("button");
            item.setAttribute("role", "menuitem");
            item.textContent = label;
            item.onclick = () => {
              if (
                label === "Not interested in this post" ||
                label === "Not interested in this Tweet"
              ) {
                window.feedback.push(id);
                post.innerHTML =
                  '<div class="native-feedback">We’ll show you fewer posts like this. <button class="undo">Undo</button></div>';
                post.querySelector(".undo").onclick = () => {
                  window.feedback = window.feedback.filter((key) => key !== id);
                  post.remove();
                  window.addPost({ id });
                };
              } else window.otherActions.push(label);
              menu.remove();
            };
            menu.append(item);
          }),
        window.itemDelay,
      );
    }, window.menuDelay);
  document.querySelector("#feed").append(post);
  return post;
};
window.addPost({ id: "101" });
window.addPost({
  id: "102",
  text: "Apparently every conversation needs to become an argument now.",
  name: "Jordan",
  handle: "jordan",
});
window.addPost({
  id: "103",
  text: "Made something small today. One button, one useful thing.",
  name: "Sam",
  handle: "sam",
});
document.querySelectorAll("[role=tab]").forEach(
  (tab) =>
    (tab.onclick = () => {
      document
        .querySelectorAll("[role=tab]")
        .forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    }),
);

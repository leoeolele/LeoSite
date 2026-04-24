const homePage = document.body.classList.contains("home-page");

if (homePage) {
  document.documentElement.style.scrollBehavior = "smooth";
}

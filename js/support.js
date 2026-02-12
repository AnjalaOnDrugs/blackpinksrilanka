window.addEventListener("load", (event) => {

    function resize() {
        //document.getElementById("bp_logo").style.height = "30px"
        var bpLogo = document.getElementById("bp_logo");
        var imgGap = document.getElementById("img_gap");
        if (!bpLogo || !imgGap) return;
        var heights = bpLogo.clientHeight;
        imgGap.style.height = heights + 20 + "px";


    }
    resize();
    window.onresize = function () {
        resize();
    };

    var lastScrollTop = 0;
    var scroll_value = 100;


window.addEventListener("scroll", function(){
   var bpLogo = document.getElementById("bp_logo");
   if (!bpLogo) return;
   var st = window.pageYOffset || document.documentElement.scrollTop;
   if (st > lastScrollTop) {

    bpLogo.style.transform = "translate(0,"+Math.trunc(window.pageYOffset/5)+"px)"
   } else if (st < lastScrollTop) {

    bpLogo.style.transform = "translate(0,"+Math.trunc(window.pageYOffset/5)+"px)"
   }
   lastScrollTop = st <= 0 ? 0 : st;
}, false);
})
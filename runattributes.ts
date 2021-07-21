"use strict";

declare var jsns;

//Find all data-hr-run attributes and run the runner they specify, it does not matter what kind of element
//contains the runner.
var runnerElements = document.querySelectorAll('[data-hr-run]');
for (var i = 0; i < runnerElements.length; ++i) {
    var runnerElement = runnerElements[i];
    var runnerAttr = runnerElement.getAttribute('data-hr-run');
    if (runnerAttr) {
        jsns.run(runnerAttr);
    }
}

export var ran = true; //Dummy operation to force this to be a module
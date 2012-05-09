require({
    baseUrl : '../..',
    packages : [
    {
        name : 'dojo',
        location : 'ThirdParty/dojo-release-1.7.2-src/dojo'
    }, {
        name : 'dijit',
        location : 'ThirdParty/dojo-release-1.7.2-src/dijit'
    }, {
        name : 'dojox',
        location : 'ThirdParty/dojo-release-1.7.2-src/dojox'
    }, {
        name : 'Core',
        location : 'Source/Core'
    }, {
        name : 'DynamicScene',
        location : 'Source/DynamicScene'
    }, {
        name : 'Renderer',
        location : 'Source/Renderer'
    }, {
        name : 'Scene',
        location : 'Source/Scene'
    }, {
        name : 'Shaders',
        location : 'Source/Shaders'
    }, {
        name : 'ThirdParty',
        location : 'Source/ThirdParty'
    }, {
        name : 'DojoWidgets',
        location : 'Apps/DojoWidgets'
    }, {
        name : 'CesiumViewer',
        location : 'Apps/CesiumViewer'
    }]
}, ['dojo/parser',
    'dojo/dom-class',
    'dojo/_base/window',
    'CesiumViewer/CesiumViewer',
    'dojo/domReady!'],
function(parser, domClass, win) {
    parser.parse();
    domClass.remove(win.body(), 'loading');
});
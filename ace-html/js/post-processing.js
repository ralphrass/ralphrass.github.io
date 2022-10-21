
var local_user = localStorage.getItem('moodle_user');

if (local_user != null){

    document.getElementById('moodle_form').style.visibility = 'hidden';
}

var editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/javascript");

editor.session.on('change', function(delta) {
    var preview = document.getElementById('preview').contentWindow.document;
        preview.open();
        preview.writeln(editor.getValue());
        preview.close();
});

//editor.change();
const BORDER_SIZE = 4;
const panel = document.getElementById("right_panel");

/*let m_pos;
function resize(e){
const dx = m_pos - e.x;
m_pos = e.x;
panel.style.width = (parseInt(getComputedStyle(panel, '').width) + dx) + "px";
}

panel.addEventListener("mousedown", function(e){
if (e.offsetX < BORDER_SIZE) {
    m_pos = e.x;
    document.addEventListener("mousemove", resize, false);
}
}, false);

document.addEventListener("mouseup", function(){
    document.removeEventListener("mousemove", resize, false);
}, false);*/
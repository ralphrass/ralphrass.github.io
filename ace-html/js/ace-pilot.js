function getCurrentMode(){
    var x = document.getElementById("mode");
    var modeValue = x.options[x.selectedIndex].value;

    return modeValue;
}

xhr2 = ""

function changeMode() {
   	var modeValue = getCurrentMode();
    if (modeValue == "javascript") {
    	editor.session.setMode("ace/mode/javascript");
    	editor.setValue("function foo(items) {\n\tvar x = \"All this is syntax highlighted\";\n\treturn x;\n}\n");
        editor.clearSelection();
        document.getElementById('run_button').disabled = false;
        document.getElementById('editor_preview').style.visibility = 'hidden';
        //document.getElementById('langExt').innerHTML = "javascript";
    } else if (modeValue == "html"){
        editor.session.setMode("ace/mode/html");
    	editor.setValue("<html>\n\n<h1>\n\n</h1>\n</html>\n");
        editor.clearSelection();
        document.getElementById('run_button').disabled = true;
        document.getElementById('editor_preview').style.visibility = 'visible';
        //document.getElementById('langExt').innerHTML = "html";

    }
}

function download(filename, text) {

    var modeValue = getCurrentMode();
    var dataType = 'data:text/plain;charset=utf-8,';

    if (modeValue == "javascript"){
        dataType = 'data:text/javascript;charset=utf-8,';
    }

    var element = document.createElement('a');
    element.setAttribute('href', dataType + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function save() {

    var modeValue = getCurrentMode();
    var fileName = 'arquivo.html';

    if (modeValue == "javascript"){
        fileName = 'arquivo.js';
    }

    download(fileName, editor.getValue());
}

function validate_moodle_user(){

    var user = document.getElementById('moodle_user').value;
    var pass = document.getElementById('moodle_pass').value;

    if (user == "" && pass == ""){
        
        alert('Informe suas credenciais');

    } else {

        var url = "https://teufuturo.adapta.online/login/token.php?service=moodle_mobile_app";

        xhr = new XMLHttpRequest();
        xhr.open("POST", url);

        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                console.log(xhr.status);
                console.log(xhr.responseText);

                if (JSON.parse(xhr.responseText).hasOwnProperty('error')){
                    alert('Credenciais inválidas');
                    return;
                }
                
                var url = "https://teufuturo.adapta.online/webservice/rest/server.php?moodlewsrestformat=json";

                xhr2 = new XMLHttpRequest();
                xhr2.open("POST", url);
                xhr2.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

                xhr2.onreadystatechange = function () {
                if (xhr2.readyState === 4) {
                    //console.log(xhr2.status);
                    console.log(xhr2.responseText);

                    localStorage.setItem('moodle_user', user);
                    localStorage.setItem('moodle_pass', pass);
                    localStorage.setItem('moodle_data', xhr2.responseText);
                    document.getElementById('moodle_form').style.visibility = 'hidden';
                }};

                var token = JSON.parse(xhr.responseText)['token'];
                var data = "wstoken="+token+"&wsfunction=core_webservice_get_site_info";
                console.log(data);

                xhr2.send(data);
            }
        };

        var data = "username="+user+"&password="+pass;

        xhr.send(data);
    }
}

function send_code(){
        
    validate_moodle_user();

    var user_code = editor.getValue();
    
    //if (local_user == null){
    
    //}
}
// $(document).ready(function() {
//     $('.selectpicker').selectpicker();
//     $('[data-toggle="tooltip"]').tooltip(); 
// });
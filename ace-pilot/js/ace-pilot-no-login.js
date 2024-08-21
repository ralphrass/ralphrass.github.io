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

function validate_moodle_user_and_send_code(){

    var user = document.getElementById('moodle_user').value;
    var pass = document.getElementById('moodle_pass').value;

    var stored_user = localStorage.getItem("moodle_user");
    var stored_pass = localStorage.getItem("moodle_pass");

    if (stored_user == null && user == "" && pass == ""){
        
        alert('Informe suas credenciais');

    } else {

        if (user == "" && pass == ""){
            user = stored_user;
            pass = stored_pass;
        }

        console.log("Autenticando...");

        var url = "https://teufuturo.adapta.online/login/token.php?service=moodle_mobile_app";

        xhr = new XMLHttpRequest();
        xhr.open("POST", url);

        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                //console.log(xhr.status);
                //console.log(xhr.responseText);

                if (JSON.parse(xhr.responseText).hasOwnProperty('error')){
                    alert('Credenciais inválidas');
                    return;
                }

                console.log("Autenticado! Obtendo dados do Moodle...");
                
                var url = "https://teufuturo.adapta.online/webservice/rest/server.php?moodlewsrestformat=json";

                xhr2 = new XMLHttpRequest();
                xhr2.open("POST", url);
                xhr2.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

                xhr2.onreadystatechange = function () {
                if (xhr2.readyState === 4) {
                    //console.log(xhr2.status);
                    //console.log(xhr2.responseText);

                    console.log("Dados do Moodle obtidos!");

                    localStorage.setItem('moodle_user', user);
                    localStorage.setItem('moodle_pass', pass);
                    localStorage.setItem('moodle_data', xhr2.responseText);
                    document.getElementById('moodle_form').style.visibility = 'hidden';
                    document.getElementById('moodle_form').style.width = 0;
                    
                    var user_code = editor.getValue();
                    var url3 = "http://localhost/php_api/teufuturo/SendCode"
                    xhr3 = new XMLHttpRequest();
                    xhr3.open("POST", url3);
                    xhr3.setRequestHeader("Content-Type", "application/json"); // x-www-form-urlencoded
                    xhr3.setRequestHeader("Access-Control-Allow-Origin", "*");
                    xhr3.setRequestHeader("Access-Control-Allow-Headers", "X-API-KEY, Origin, X-Requested-With, content-type, accept, Access-Control-Request-Method");
                    xhr3.setRequestHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
                    xhr3.setRequestHeader("Access-Control-Max-Age", "1728000");

                    xhr3.onreadystatechange = function () {
                        if (xhr3.readyState === 4) { //  && xhr3.status === 201

                            document.write(xhr3.responseText);
                        }
                    }

                    var json_response = JSON.parse(xhr2.responseText);
                    var moodle_id = json_response.userid;
                    var user_fullname = json_response.fullname;

                    xhr3.onreadystatechange = function () {
                        if (xhr3.readyState === 4) { //  && xhr3.status === 201
                
                            console.log(xhr3.responseText);
                        }
                    }

                    xhr3.send(JSON.stringify({ "code": user_code, "user": user, "fullname": user_fullname, "moodle_id": moodle_id }));
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
        
    validate_moodle_user_and_send_code();

    //if (local_user == null){
    
    //}
}
// $(document).ready(function() {
//     $('.selectpicker').selectpicker();
//     $('[data-toggle="tooltip"]').tooltip(); 
// });
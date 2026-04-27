
document.querySelector("form").addEventListener("submit",validateAuthor);


function validateAuthor(e){
    let fName = document.querySelector("input[name=firstName]").value;
    let isValid = true;

    if (fName.length < 4) {
       alert("The first Name should have at least 3 characters");
       isValid = false; 
    }

    if (!isValid){
        e.preventDefault();
    }


}
const multer = require('multer')
const path = require('path');



 const storage = multer.diskStorage({
    destination:(req,res,cb)=> {
        cb(null,path.join(__dirname, "../public/uploads/productImage"))

    },
    fileName:(req,res,cb)=>{
        cb(null,Date.now() + "-"+file.originalname)
    }

})

const uploads = multer({ storage: storage });
module.exports = uploads;

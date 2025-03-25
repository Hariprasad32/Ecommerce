
const User = require('../models/userSchema')

const userAuth = async (req, res, next) => {
    try {
        const user = req.session.user
        
        
        const findUser = await User.findOne({_id:user, isBlocked:false})

        if(user && findUser){
            next()
        }else{
            req.session.user = undefined
            req.session.userData = undefined
            res.render("home")
        }
       
    } catch (error) {
        console.log("Error in userAuth middleware:", error);
        res.status(500).send("Internal server error");
    }
};







const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        return next(); 
    } else {
        return res.redirect('/admin/login'); 
    }
};



module.exports ={
    userAuth,
    adminAuth,
    
}
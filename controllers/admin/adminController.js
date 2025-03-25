const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');



const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect("/admin/dashboard");
        }
        return res.render("admin-login", { message: null });
    
    } catch (error) {
        console.log("admin login error")
        res.redirect('/error-page')
    }
   };

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

       
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.status(401).send("Invalid email or not an admin");
        }

       
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).send("Invalid password");
        }

        
        if (admin.isBlocked) {
            return res.status(403).send("Admin account is blocked");
        }

        
        req.session.admin = admin._id.toString();
        console.log("Session admin set to:", req.session.admin);

        res.redirect("/admin/dashboard");
    } catch (error) {
        console.log("Login error:", error);
        res.status(500).send("Internal server error");
    }
};
const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            return res.render("dashboard",{page:""});
        } catch (error) {
            return res.redirect("/error-page");
        }
    } else {
        return res.redirect("/admin/login"); 
    }
};

const logout = async (req,res)=>{
    try {
        req.admin.session = undefined;
        req.adminData = undefined;
            res.redirect('/admin/login')
    
    } catch (error) {

        console.log("error during destroying session");
        
        
    }
}

const errorPage = async (req,res)=>{
    try {
        return res.render("error-page")
    } catch (error) {
        console.log("error during loading 404 page");
        return res.status(500).send("Internal server error")
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout,
    errorPage
};

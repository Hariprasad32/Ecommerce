const mongoose = require("mongoose")
const {Schema} = mongoose; 


const productSchema = new Schema({
    productName:{
        type : String,
        required : true
    },
    description:{ 
        type : String,
        required :true
    },
    brand:{
        type : String,
        required : false
    },
    category:{
        type : Schema.Types.ObjectId,
        ref : "Category",
        required : true
    },
    regularPrice:{
        type : Number,
        required : true
    },
    salePrice:{
        type : Number ,
        required : true
    },
    productOffer:{
        type : Number ,
        default: 0,
    },
    sizes:[{
        size:{
            type : String,
            required : true
        },
        quantity:{
            type : Number,
            required : true
        }
    }],
    color:{
        type : String,
        required : true
    },
    productImage:{
        type : [String],
        required : true
    },
    isBlocked:{
        type : Boolean,
        default : false
    },
    status:{
        type:String,
        enum:["Available","Out Of Stock","Discontinued"],
        default:"Available",
        required:true
    },

},{timestamps:true})

const Product = mongoose.model("Product",productSchema)


module.exports = Product
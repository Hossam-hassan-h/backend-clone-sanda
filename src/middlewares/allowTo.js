import { AppError } from "./appError.js";
import statusText from "../utils/statusText.js";

export default (...allowedRoles) => {

return (req,res,next)=>{
   if (!allowedRoles.includes(req.user.role)) {
            return next(new AppError("NOT AUTHORIZED", 403, statusText.FAIL));
        }
next()

}

}

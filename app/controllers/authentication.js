var jwt = require('jsonwebtoken');  
var User = require('../models/user');
var authConfig = require('../../config/auth');
var twConfig = require('../../config/twconfig');
var client = require('twilio')(twConfig.twilio_account_sid, twConfig.twilio_auth_token);
var speakeasy = require('speakeasy');
var Q = require('q');
var bcrypt = require('bcryptjs');
 
function generateToken(user){
    return jwt.sign(user, authConfig.secret, {
        expiresIn: 10080
    });
}
 
function setUserInfo(request){
    return {
        _id: request._id,
        email: request.email,
        phone: request.phone,
        verified: request.verified,
        role: request.role
    };
}
 
exports.login = function(req, res, next){
 
    var userInfo = setUserInfo(req.user);
 
    res.status(200).json({
        token: 'JWT ' + generateToken(userInfo),
        user: userInfo
    });
 
}
 
exports.register = function(req, res, next){
 
    var email = req.body.email;
    var phone = req.body.phone;
    var password = req.body.password;
    var role = req.body.role;
 
    if(!email){
        return res.status(422).send({error: 'Email address is required!'});
    }

    if(!phone){
        return res.status(422).send({error: 'Phone number is required!'});
    }
 
    if(!password){
        return res.status(422).send({error: 'Password is required!'});
    }
 
    User.findOne({email: email}, function(err, existingUser){
 
        if(err){
            return next(err);
        }
 
        if(existingUser){
            return res.status(422).send({error: 'The email address you submitted is already taken!'});
        }
 
        var user = new User({
            email: email,
            phone: phone,
            verified: 'unverified',
            password: password,
            role: role
        });
 
        user.save(function(err, user){
            if(err){
                console.log(err);
                return next(err);
            }
            
            var userInfo = setUserInfo(user);
 			
            res.status(201).json({
                token: 'JWT ' + generateToken(userInfo),
                user: userInfo
            });

            sendVerificationMessage(user, res, next);
        });
    });
 
}

exports.verify = function(req, res, next){
 	var deferred = Q.defer();

    var email = req.body.email;
    var verified = req.body.verified;
 
    if(!email){
        return res.status(422).send({error: 'Email address unprovided!'});
    }

    if(!verified){
        return res.status(422).send({error: 'Verification code is required!'});
    }
 
    var user = req.user;

    User.findById(user._id, function(err, foundUser){

        if(err){
            res.status(422).json({error: 'User not found.'});
            return next(err);
        }

	    if(foundUser){
	    	if(bcrypt.compareSync(verified, foundUser.verified)){
	    		foundUser.verified = 'verified';

	    		foundUser.save(function(err, updatedUser){
		     		if(err){
		     			console.log(err);
		     			return next(err);
		     		}

					var userInfo = setUserInfo(updatedUser);

			      	return res.status(201).json({
			              token: 'JWT ' + generateToken(userInfo),
			              user: userInfo
			        });

	     		});
	    	}else{
	    		foundUser.verified = 'unverified';

	    		return next('Wrong verification code.');
	    	}
	     	

	     }else{
	     	return res.status(411).send({error: 'Your account doesn`t exist!'}); //error code 411?
	     }
    });
    
    return deferred.promise;
}

function sendVerificationMessage(user){
	var deferred = Q.defer();

    var code = speakeasy.totp({key: 'abc123'});
    client.sendSms({
        to: user.phone,
        from: twConfig.twilio_from_number,
        body: 'Your verificiation code is: ' + code
    }, function(twilioerr, responseData){
        if(twilioerr){
            user.verified = 'unverified';
            user.save(function(err, user){
		 		if(err){
		 			//console.log(err);
		 			deferred.resolve(err);
		 		}
		      	deferred.resolve('Invalid phone number. [' + twilioerr + ']');
		 	});
        }else{
            user.verified = bcrypt.hashSync(code, 10);
            user.save(function(err, user){
		 		if(err){
		 			//console.log(err);
		 			deferred.resolve(err);
		 		}
		      	deferred.resolve('Code generated.');
		 	});
        }
    });

    return deferred.promise;
}

exports.roleAuthorization = function(roles){
 
    return function(req, res, next){
 
        var user = req.user;
 
        User.findById(user._id, function(err, foundUser){
 
            if(err){
                res.status(422).json({error: 'User not found.'});
                return next(err);
            }
 
            if(roles.indexOf(foundUser.role) > -1){
                return next();
            }
 
            res.status(401).json({error: 'You are not authorized to view this content'});
            return next('Unauthorized');
 
        });
 
    }
 
}
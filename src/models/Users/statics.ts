import { UserRegisterInfo, UserCollectionInterface } from "./interface";
import { AuthTokens } from "../AuthTokens";
import bcrypt from "bcrypt";
import * as utils from "./utils";

/**
 * This is a function that takes in UserRegisterInfo,
 * then creates and sets verification code for user
 *
 * @param this for type decleration
 * @param info the registration info for the user
 * @returns User
 */
export const register = async function (
	this: UserCollectionInterface,
	info: UserRegisterInfo
) {
	// if password dont match throw error: Password must match
	if (info.password !== info.password2)
		throw new Error("[[translation:faceb97a-63cc-48e1-9b5b-7917546711b2]]");
	const user = await this.create(info);
	await user.setVerificationCode();
	return user;
};

/**
 * This is a function that takes in email and password,
 * Finds User by username and password and generates a new auth token.
 *
 * @param this for type declaration
 * @param email the email of the user you want to find
 * @param password the password of the user you want to find
 * @returns Object with public User and token
 */
export const findByCreds = async function (
	this: UserCollectionInterface,
	email: string,
	password: string
) {
	// find user by email
	const user = await this.findOne({ email: email.toLowerCase().trim() });
	// if no user found, throw error
	if (!user) throw new Error("[[translation:339ca901-d88e-4e10-916a-95c54a4ed932]]");
	// check if password matches found user password
	const isMatch = await bcrypt.compare(password, user.password);
	// if no match throw error
	if (!isMatch) throw new Error("[[translation:339ca901-d88e-4e10-916a-95c54a4ed932]]");
	// generate new auth token
	const token = await AuthTokens.generate(user._id);
	return {
		user: user.getPublic(),
		token: token,
	};
};

/**
 * This is a function that takes in the email of the user you want to find,
 * then generates a new reset-password verification code and sets the reset-password request date.
 * Saves the user
 *
 * @param this type declaration
 * @param email the email of the user you want to find
 */
export const findByEmailAndRequestResetPasswordCode = async function (
	this: UserCollectionInterface,
	email: string
) {
	const user = await this.findOne({ email });
	if (!user) throw new Error(`User not found with email: ${email}`);
	// set the reset-password verificationcode and date of reset password request
	user.resetPasswordCode = {
		code: utils.generateVerificationCode(utils.RESET_PASSWORD_CODE_LENGTH),
		requestedAt: new Date(),
	};
	// clear reset password token and reset guess count
	user.resetPasswordToken = undefined;
	user.resetPasswordCodeGuessCount = 0;
	await user.save();
};

/**
 * This is a function that takes in email of the user you want to find and verification code he has recieved by email
 * and entered in the front end.
 *
 * If the user code matches the code assign to him,
 * we generate a new reset password token that allows him to reset his password.
 *
 * The reset password token is valid for 5 minutes.
 *
 * @param this - type declaration
 * @param email - email of user requesting to reset password
 * @param code - reset-password verification code
 * @returns resetPasswordToken
 */
export const findByEmailAndRequestResetPasswordToken = async function (
	this: UserCollectionInterface,
	email: string,
	code: string
) {
	// check if code is undefined
	if (code === undefined) throw new Error("No code received");

	// find user by email
	const user = await this.findOne({ email });

	// make sure user exists and has resetPasswordInfo
	if (!user || user.resetPasswordCode === undefined)
		throw new Error(`No user with email ${email} has requested code`);

	if (user.resetPasswordCodeGuessCount >= utils.RESET_PASSWORD_MAX_GUESS_COUNT)
		throw new Error("Too many attempts to guess reset password code");

	// check if code has expired
	if (
		new Date().getTime() - user.resetPasswordCode.requestedAt.getTime() >
		utils.RESET_PASSWORD_CODE_TIME_PERIOD_LENGTH
	)
		throw new Error("code is no longer valid");

	const hashedInput = user.sha256(code);

	// if it isnt the same as the hashed code
	// then we increment a counter
	if (user.resetPasswordCode.code !== hashedInput) {
		user.resetPasswordCodeGuessCount += 1;
		await user.save();
		throw new Error("Hashed codes do not match");
	}

	/**
	 * Set the resetPasswordToken object to the user
	 *
	 * The token itself is generated by concating different
	 * pieces of information to attacks difficult.
	 *
	 * There are three parts for the input of the hashing algorithm
	 *
	 *     - the reset password code (8 digits)
	 *     - the ISO string of date.now() (24 chars)
	 *     - random number generated (30 digits)
	 *
	 * These pieces are concatenated and fed into sha256, whose
	 * output is the resetpassword token.
	 *
	 * Not counting for the timestamp there are approximately
	 *
	 * 2^126 possible strings that can be fed into the hashing algorithm
	 *
	 * and since the token is only valid for 5 minutes, it should
	 * be unfeasible to brute force guess the tokens
	 */
	user.resetPasswordToken = {
		token: await user.hashString(
			(user.resetPasswordCode.code +
				new Date().toISOString() +
				utils.generateVerificationCode(
					utils.RESET_PASSWORD_TOKEN_RANDOM_NUM_LENGTH
				)) as string
		),
		requestedAt: new Date(),
	};
	// clearing code since it has been used
	await user.update({
		$unset: { resetPasswordCode: "" },
	});

	await user.save();

	return user.resetPasswordToken.token;
};

/**
 * This is a function that takes in 3 arguments, users email, reset-password token and password.
 *
 * Finds user by id and if token is valid resets password and updates user info
 *
 * @param this - type declaration
 * @param email - email of user you want to find
 * @param token - users reset-password token
 * @param password - users new password
 * @returns UserInterface
 */
export const findByEmailAndResetPassword = async function (
	this: UserCollectionInterface,
	email: string,
	token: string,
	password: string
) {
	// check if code is undefined
	if (token === undefined) throw new Error("No code received");

	// find user by email
	const user = await this.findOne({ email });

	// make sure user exists and has resetPasswordInfo
	if (!user || user.resetPasswordToken === undefined)
		throw new Error(`No user with email ${email} has requested token`);

	// check if code has expired
	if (
		new Date().getTime() - user.resetPasswordToken.requestedAt.getTime() >
		utils.RESET_PASSWORD_TOKEN_TIME_PERIOD_LENGTH
	)
		throw new Error("Token is no longer valid");

	if (token !== user.resetPasswordToken.token) throw new Error("Token invalid");

	user.password = password;

	await user.update({
		$unset: { resetPasswordToken: "" },
	});

	await user.save();

	return user;
};

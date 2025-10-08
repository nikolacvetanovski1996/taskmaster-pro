﻿using AutoMapper;
using Microsoft.AspNetCore.WebUtilities;
using System.Linq;
using System.Text;
using taskmaster_pro.Application.Features.Authentication.Commands.ConfirmEmail;
using taskmaster_pro.Application.Features.Authentication.Commands.ForgotPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.GetSecurityQuestion;
using taskmaster_pro.Application.Features.Authentication.Commands.LoginUser;
using taskmaster_pro.Application.Features.Authentication.Commands.RegisterUser;
using taskmaster_pro.Application.Features.Authentication.Commands.ResetPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.VerifySecurityAnswer;
using taskmaster_pro.Application.Features.Authentication.DTOs;
using taskmaster_pro.Application.Helpers;
using taskmaster_pro.Application.Interfaces;

namespace Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthenticationController : ControllerBase
    {
        #region Fields

        private readonly IMediator _mediator;
        private readonly IEmailSender _emailSender;
        private readonly IRecaptchaValidator _captchaValidator;
        private readonly IConfiguration _configuration;
        private readonly IMapper _mapper;
        private readonly ILogger<AuthenticationController> _logger;

        #endregion

        #region Constructor

        public AuthenticationController(
            IMediator mediator,
            IEmailSender emailSender,
            IRecaptchaValidator captchaValidator,
            IConfiguration configuration,
            IMapper mapper,
            ILogger<AuthenticationController> logger)
        {
            _mediator = mediator;
            _emailSender = emailSender;
            _captchaValidator = captchaValidator;
            _configuration = configuration;
            _mapper = mapper;
            _logger = logger;
        }

        #endregion

        #region Public Methods

        // Registers a new user, hashes security answer, assigns default role and sends confirmation email
        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Check if the captcha is valid
            if (!await IsCaptchaValid(model.RecaptchaToken))
                return BadRequest(new { error = "CAPTCHA validation failed." });

            var command = _mapper.Map<RegisterUserCommand>(model);
            var result = await _mediator.Send(command);

            if (!result.Succeeded)
                return BadRequest(result.Errors);

            // Encode user ID and token for frontend URL
            var encodedUserId = Uri.EscapeDataString(result.UserId);
            var encodedToken = Uri.EscapeDataString(result.Token);

            var frontendBase = _configuration["Frontend:BaseUrl"]!;

            var confirmationLink = $"{frontendBase}/email-confirmation" +
                $"?userId={encodedUserId}" +
                $"&token={encodedToken}";

            // Send email
            var html = EmailTemplates.GetEmailConfirmationTemplate(confirmationLink);
            await _emailSender.SendEmailAsync(model.Email, "Confirm your email", html);
                    
            return Ok(new { Message = "Registration successful. Please check your email to confirm your account." });
        }

        // Confirms user's email using provided userId and token
        [HttpPost("confirm-email")]
        public async Task<IActionResult> ConfirmEmail(ConfirmEmailDto model)
        {
            if (model.UserId == null || model.Token == null)
                return BadRequest("User ID and token are required");

            var command = _mapper.Map<ConfirmEmailCommand>(model);
            var result = await _mediator.Send(command);

            if (!result.Succeeded && result.Message == "User not found.")
                return NotFound(result.Message);

            if (result.Succeeded)
                return Ok(new { result.Message });
            else
                return BadRequest(new { error = result.Message });
        }

        // Validates credentials and returns JWT token for successful login
        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var command = _mapper.Map<LoginUserCommand>(model);
            var result = await _mediator.Send(command);

            if (!result.Succeeded)
            {
                if (result.Code == "EmailNotConfirmed")
                    return StatusCode(403, new { code = result.Code, error = result.Error });

                return Unauthorized(result.Error);
            }

            return Ok(new { result.Token });
        }

        // Initiates password reset flow: validates captcha, generates reset token and emails reset link
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword(ForgotPasswordDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Check if the captcha is valid
            if (!await IsCaptchaValid(model.RecaptchaToken))
                return BadRequest(new { error = "CAPTCHA validation failed." });

            var command = _mapper.Map<ForgotPasswordCommand>(model);
            var result = await _mediator.Send(command);

            if (!string.IsNullOrEmpty(result.Token))
            {
                try
                {
                    // Encode email and token for frontend URL
                    var tokenBytes = Encoding.UTF8.GetBytes(result.Token);
                    var encodedEmail = Uri.EscapeDataString(result.Email);
                    var encodedToken = WebEncoders.Base64UrlEncode(tokenBytes).TrimEnd('=');

                    var frontendBase = _configuration["Frontend:BaseUrl"]!;

                    var resetLink = $"{frontendBase}/reset-password" +
                        $"?email={encodedEmail}" +
                        $"&token={encodedToken}";

                    // Send email
                    var html = EmailTemplates.GetPasswordResetTemplate(resetLink);
                    await _emailSender.SendEmailAsync(result.Email, "Password Reset Request", html);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send password reset email for {Email}", model.Email);
                }
            }

            return Ok(new { Message = "If your email is registered and confirmed, you will receive a password reset link." });
        }

        // Resets password using token provided by reset flow
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword(ResetPasswordDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var email = Uri.UnescapeDataString(model.Email);

            // Decode token
            var incoming = model.Token;
            var padLength = (4 - incoming.Length % 4) % 4;
            var paddedToken = incoming + new string('=', padLength);
            var tokenBytes = WebEncoders.Base64UrlDecode(paddedToken);
            var decodedToken = Encoding.UTF8.GetString(tokenBytes);

            var command = _mapper.Map<ResetPasswordCommand>(model);
            command.Token = decodedToken;
            var result = await _mediator.Send(command);

            if (result.Succeeded)
                return Ok(new { Message = "Password has been reset successfully" });

            if (result.Errors?.Count == 1 && result.Errors[0].Description == "Invalid request")
                return BadRequest("Invalid request");

            return BadRequest(new { errors = result.Errors });
        }

        // Returns the user's security question and a short-lived session token for verification step
        [HttpPost("get-security-question")]
        public async Task<IActionResult> GetSecurityQuestion([FromBody] SecurityQuestionRequestDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Check if the captcha is valid
            if (!await IsCaptchaValid(model.RecaptchaToken))
                return BadRequest(new { error = "CAPTCHA validation failed." });

            var command = _mapper.Map<GetSecurityQuestionCommand>(model);
            var result = await _mediator.Send(command);

            if (result == null)
                return BadRequest(new { error = "Invalid email or answer." });

            return Ok(new { securityQuestion = result.SecurityQuestion, sessionToken = result.SessionToken });
        }

        // Verifies the provided security answer, enforces lockout on repeated failures and returns reset token on success
        [HttpPost("verify-security-answer")]
        public async Task<IActionResult> VerifySecurityAnswer([FromBody] VerifySecurityAnswerDto model)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Check if the captcha is valid
            if (!await IsCaptchaValid(model.RecaptchaToken))
                return BadRequest(new { error = "CAPTCHA validation failed." });

            var command = _mapper.Map<VerifySecurityAnswerCommand>(model);
            var result = await _mediator.Send(command);

            if (!result.Succeeded)
            {
                if (result.LockoutWaitMinutes.HasValue)
                    return StatusCode(429, result.Errors.First());

                return BadRequest(new { error = "Invalid email or answer." });
            }

            // Encode email and token for frontend URL
            var encodedEmail = Uri.EscapeDataString(model.Email);
            var tokenBytes = Encoding.UTF8.GetBytes(result.ResetToken!);
            var encodedToken = WebEncoders.Base64UrlEncode(tokenBytes).TrimEnd('=');

            var frontendBase = _configuration["Frontend:BaseUrl"]!;

            var resetLink = $"{frontendBase}/reset-password" +
                $"?email={encodedEmail}" +
                $"&token={encodedToken}";

            return Ok(new
            {
                token = encodedToken,
                email = encodedEmail,
                resetLink
            });
        }

        #endregion

        #region Private Methods

        // Wrapper for captcha validation
        private async Task<bool> IsCaptchaValid(string token)
        {
            return await _captchaValidator.IsCaptchaValidAsync(token);
        }

        #endregion
    }
}
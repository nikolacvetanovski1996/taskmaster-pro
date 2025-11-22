using Microsoft.AspNetCore.Identity;
using taskmaster_pro.Application.Features.Authentication.Commands.ConfirmEmail;
using taskmaster_pro.Application.Features.Authentication.Commands.ForgotPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.GetSecurityQuestion;
using taskmaster_pro.Application.Features.Authentication.Commands.LoginUser;
using taskmaster_pro.Application.Features.Authentication.Commands.RegisterUser;
using taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation;
using taskmaster_pro.Application.Features.Authentication.Commands.ResetPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.VerifySecurityAnswer;
using taskmaster_pro.Application.Features.Authentication.DTOs;
using taskmaster_pro.Infrastructure.Persistence.Contexts.Entities;

namespace taskmaster_pro.Infrastructure.Persistence.IdentityServices
{
    public class AuthenticationService : IAuthenticationService
    {
        #region Fields

        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly IJwtTokenService _jwtTokenService;
        private readonly IFrontendUrlBuilder _frontendUrlBuilder;
        private readonly ISessionService _sessionService;

        #endregion

        #region Constructor

        public AuthenticationService(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            IJwtTokenService jwtTokenService,
            IFrontendUrlBuilder frontendUrlBuilder,
            ISessionService sessionService)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _jwtTokenService = jwtTokenService;
            _frontendUrlBuilder = frontendUrlBuilder;
            _sessionService = sessionService;
        }

        #endregion

        #region Public Methods

        public async Task<RegisterUserResult> RegisterUserAsync(RegisterUserCommand request)
        {
            var user = new ApplicationUser
            {
                UserName = request.Email,
                Email = request.Email,
                FirstName = request.FirstName,
                LastName = request.LastName,
                SecurityQuestion = request.SecurityQuestion
            };

            user.SecurityAnswerHash = new PasswordHasher<ApplicationUser>()
                .HashPassword(user, request.SecurityAnswer);

            var result = await _userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
            {
                return new RegisterUserResult
                {
                    Succeeded = false,
                    Errors = result.Errors
                    .Select(e => new IdentityErrorDto { Code = e.Code ?? string.Empty, Description = e.Description })
                    .ToList()
                };
            }

            await _userManager.AddToRoleAsync(user, "User");

            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            var link = _frontendUrlBuilder.BuildEmailConfirmationLink(user.Id, token);

            return new RegisterUserResult
            {
                Succeeded = true,
                UserId = user.Id,
                Token = token
            };
        }

        public async Task<ConfirmEmailResult> ConfirmEmailAsync(string userId, string token)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
                return new ConfirmEmailResult { Succeeded = false, Message = "User not found." };

            var result = await _userManager.ConfirmEmailAsync(user, token);
            if (result.Succeeded)
                return new ConfirmEmailResult { Succeeded = true, Message = "Your email has been successfully confirmed. You can now log in." };

            return new ConfirmEmailResult { Succeeded = false, Message = "Email confirmation failed." };
        }

        public async Task<ResendConfirmationResult> ResendConfirmationAsync(ResendConfirmationCommand request)
        {
            var result = new ResendConfirmationResult
            {
                Email = request.Email ?? string.Empty,
                UserId = null,
                Token = string.Empty,
                AlreadyConfirmed = false
            };

            if (string.IsNullOrWhiteSpace(request.Email))
                return result;

            var user = await _userManager.FindByEmailAsync(request.Email);
            if (user == null)
            {
                // Not found -> token empty, do not leak existence
                return result;
            }

            // Set user id and email for controller usage
            result.UserId = user.Id;
            result.Email = user.Email;

            if (await _userManager.IsEmailConfirmedAsync(user))
            {
                // Already confirmed -> indicate that
                result.AlreadyConfirmed = true;
                return result;
            }

            // User exists and is NOT confirmed -> generate token
            var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);

            result.Token = token; // Raw token (controller will encode)
            return result;
        }

        public async Task<LoginUserResult> LoginUserAsync(LoginUserCommand request)
        {
            var user = await _userManager.FindByEmailAsync(request.Email);
            if (user == null)
                return new LoginUserResult { Succeeded = false, Error = "Invalid login attempt" };

            // Prevent login if user is soft-deleted
            if (user.IsDeleted)
                return new LoginUserResult { Succeeded = false, Error = "Account is deactivated.", Code = "AccountDeleted" };

            // Prevent login if user isn't confirmed yet
            if (!await _userManager.IsEmailConfirmedAsync(user) && await _userManager.CheckPasswordAsync(user, request.Password))
                return new LoginUserResult { Succeeded = false, Error = "Email is not confirmed.", Code = "EmailNotConfirmed" };

            // Use SignInManager to preserve lockout behavior
            var signInResult = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);

            if (!signInResult.Succeeded)
            {
                return new LoginUserResult { Succeeded = false, Error = "Invalid login attempt" };
            }

            var roles = await _userManager.GetRolesAsync(user);
            var token = _jwtTokenService.GenerateToken(user.Id, user.Email, roles);

            return new LoginUserResult { Succeeded = true, Token = token };
        }

        public async Task<ForgotPasswordResult> ForgotPasswordAsync(ForgotPasswordCommand request)
        {
            var user = await _userManager.FindByEmailAsync(request.Email);
            if (user == null)
                return new ForgotPasswordResult { Email = request.Email, Token = string.Empty };

            // Don't issue password-reset tokens for unconfirmed accounts
            if (!await _userManager.IsEmailConfirmedAsync(user))
                return new ForgotPasswordResult { Email = user.Email, Token = string.Empty };

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);

            return new ForgotPasswordResult
            {
                Email = user.Email,
                Token = token
            };
        }

        public async Task<ResetPasswordResult> ResetPasswordAsync(string email, string token, string newPassword)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user == null)
            {
                return new ResetPasswordResult
                {
                    Succeeded = false,
                    Errors = new List<IdentityErrorDto>
                    {
                        new IdentityErrorDto { Code = string.Empty, Description = "Invalid request" }
                    }
                };
            }

            if (!await _userManager.IsEmailConfirmedAsync(user))
            {
                return new ResetPasswordResult
                {
                    Succeeded = false,
                    Errors = new List<IdentityErrorDto>
                    {
                        new IdentityErrorDto { Code = "EmailNotConfirmed", Description = "Email is not confirmed." }
                    }
                };
            }

            var result = await _userManager.ResetPasswordAsync(user, token, newPassword);

            if (result.Succeeded)
            {
                return new ResetPasswordResult
                {
                    Succeeded = true,
                    Message = "Password has been reset successfully",
                    Errors = new List<IdentityErrorDto>()
                };
            }

            var mappedErrors = result.Errors
                .Select(e => new IdentityErrorDto
                {
                    Code = e.Code ?? string.Empty,
                    Description = e.Description
                })
                .ToList();

            return new ResetPasswordResult
            {
                Succeeded = false,
                Errors = mappedErrors
            };
        }

        public async Task<GetSecurityQuestionResult?> GetSecurityQuestionAsync(string email)
        {
            var user = await _userManager.FindByEmailAsync(email);

            // Always create a session token (real or fake) so timing/response shape is consistent
            var sessionToken = await _sessionService.CreateSessionAsync(email, expiresInMinutes: 10);

            if (user == null)
            {
                // Return a fake / generic security question from the existing options, so the response is indistinguishable
                var fakeQuestions = new[] {
                    "What was your childhood nickname?",
                    "What is the name of your first pet?",
                    "What is your mother’s maiden name?",
                    "What was the make of your first car?",
                    "In what city were you born?"
                };

                // Pick random but keep deterministic length similar to typical questions:
                var rng = new Random();
                var fakeQuestion = fakeQuestions[rng.Next(fakeQuestions.Length)];

                return new GetSecurityQuestionResult
                {
                    SecurityQuestion = fakeQuestion,
                    SessionToken = sessionToken
                };
            }

            return new GetSecurityQuestionResult
            {
                SecurityQuestion = user.SecurityQuestion,
                SessionToken = sessionToken
            };
        }

        public async Task<VerifySecurityAnswerResult> VerifySecurityAnswerAsync(string email, string answer, string? sessionToken = null)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user == null)
                return new VerifySecurityAnswerResult
                {
                    Succeeded = false,
                    Errors = new List<string> { "Invalid email or answer." }
                };

            // Session validation
            if (!string.IsNullOrEmpty(sessionToken))
            {
                var valid = await _sessionService.ValidateSessionTokenAsync(sessionToken, email);
                if (!valid)
                    return new VerifySecurityAnswerResult
                    {
                        Succeeded = false,
                        Errors = new List<string> { "Session token invalid or expired." }
                    };
            }

            // Lockout check
            if (IsUserLockedOut(user, out var waitMinutes))
            {
                return new VerifySecurityAnswerResult
                {
                    Succeeded = false,
                    LockoutWaitMinutes = waitMinutes,
                    Errors = new List<string> { $"Too many failed attempts. Try again in {Math.Ceiling(waitMinutes)} minutes." }
                };
            }

            // Check answer
            if (!VerifySecurityAnswer(user, answer))
            {
                await IncrementFailedAttemptsAsync(user);
                return new VerifySecurityAnswerResult
                {
                    Succeeded = false,
                    Errors = new List<string> { "Invalid email or answer." }
                };
            }

            // Block issuing reset tokens for accounts that haven't confirmed email
            if (!await _userManager.IsEmailConfirmedAsync(user))
            {
                return new VerifySecurityAnswerResult
                {
                    Succeeded = false,
                    Code = "EmailNotConfirmed",
                    Errors = new List<string> { "Email is not confirmed." }
                };
            }

            // Successful: reset attempts and mark session used
            await ResetFailedAttemptsAsync(user);
            if (!string.IsNullOrEmpty(sessionToken))
                await _sessionService.MarkSessionTokenUsedAsync(sessionToken);

            // Generate reset token (raw, not encoded)
            var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);

            return new VerifySecurityAnswerResult
            {
                Succeeded = true,
                ResetToken = resetToken
            };
        }

        #endregion

        #region Private Methods

        // Checks if a user is currently locked out from answering security question
        private static bool IsUserLockedOut(ApplicationUser user, out double waitMinutes)
        {
            waitMinutes = 0;
            if (user.SecurityQuestionLockoutEnd.HasValue && user.SecurityQuestionLockoutEnd > DateTime.UtcNow)
            {
                waitMinutes = (user.SecurityQuestionLockoutEnd.Value - DateTime.UtcNow).TotalMinutes;
                return true;
            }
            return false;
        }

        // Verifies the provided security answer against stored hash
        private static bool VerifySecurityAnswer(ApplicationUser user, string answer)
        {
            var passwordHasher = new PasswordHasher<ApplicationUser>();
            var result = passwordHasher.VerifyHashedPassword(user, user.SecurityAnswerHash, answer);
            return result != PasswordVerificationResult.Failed;
        }

        // Increments failed attempts and applies lockout if threshold reached
        private async Task IncrementFailedAttemptsAsync(ApplicationUser user)
        {
            user.FailedSecurityQuestionAttempts++;

            if (user.FailedSecurityQuestionAttempts >= 5)
            {
                user.SecurityQuestionLockoutEnd = DateTime.UtcNow.AddMinutes(15);
                user.FailedSecurityQuestionAttempts = 0;
            }

            await _userManager.UpdateAsync(user);
        }

        // Resets failed attempts and lockout
        private async Task ResetFailedAttemptsAsync(ApplicationUser user)
        {
            user.FailedSecurityQuestionAttempts = 0;
            user.SecurityQuestionLockoutEnd = null;
            await _userManager.UpdateAsync(user);
        }

        #endregion
    }
}
using taskmaster_pro.Application.Features.Authentication.Commands.ConfirmEmail;
using taskmaster_pro.Application.Features.Authentication.Commands.ForgotPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.GetSecurityQuestion;
using taskmaster_pro.Application.Features.Authentication.Commands.LoginUser;
using taskmaster_pro.Application.Features.Authentication.Commands.RegisterUser;
using taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation;
using taskmaster_pro.Application.Features.Authentication.Commands.ResetPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.VerifySecurityAnswer;

namespace taskmaster_pro.Application.Interfaces
{
    public interface IAuthenticationService
    {
        Task<RegisterUserResult> RegisterUserAsync(RegisterUserCommand request);
        Task<ConfirmEmailResult> ConfirmEmailAsync(string userId, string token);
        Task<ResendConfirmationResult> ResendConfirmationAsync(ResendConfirmationCommand request);
        Task<LoginUserResult> LoginUserAsync(LoginUserCommand request);
        Task<ForgotPasswordResult> ForgotPasswordAsync(ForgotPasswordCommand request);
        Task<ResetPasswordResult> ResetPasswordAsync(string email, string token, string newPassword);
        Task<GetSecurityQuestionResult?> GetSecurityQuestionAsync(string email);
        Task<VerifySecurityAnswerResult> VerifySecurityAnswerAsync(string email, string answer, string? sessionToken = null);
    }
}

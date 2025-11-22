using AutoMapper;
using taskmaster_pro.Application.Features.Authentication.Commands.ConfirmEmail;
using taskmaster_pro.Application.Features.Authentication.Commands.ForgotPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.GetSecurityQuestion;
using taskmaster_pro.Application.Features.Authentication.Commands.LoginUser;
using taskmaster_pro.Application.Features.Authentication.Commands.RegisterUser;
using taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation;
using taskmaster_pro.Application.Features.Authentication.Commands.ResetPassword;
using taskmaster_pro.Application.Features.Authentication.Commands.VerifySecurityAnswer;
using taskmaster_pro.Application.Features.Authentication.DTOs;

namespace taskmaster_pro.Infrastructure.Persistence.Mappings
{
    public class AuthenticationProfile : Profile
    {
        public AuthenticationProfile()
        {
            CreateMap<RegisterDto, RegisterUserCommand>();
            CreateMap<LoginDto, LoginUserCommand>();
            CreateMap<ForgotPasswordDto, ForgotPasswordCommand>();
            CreateMap<SecurityQuestionRequestDto, GetSecurityQuestionCommand>();
            CreateMap<VerifySecurityAnswerDto, VerifySecurityAnswerCommand>();
            CreateMap<ResendConfirmationDto, ResendConfirmationCommand>();
            CreateMap<ResetPasswordDto, ResetPasswordCommand>();
            CreateMap<ConfirmEmailDto, ConfirmEmailCommand>();
        }
    }
}

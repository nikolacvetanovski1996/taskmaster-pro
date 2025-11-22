namespace taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation
{
    public class ResendConfirmationCommandValidator : AbstractValidator<ResendConfirmationCommand>
    {
        public ResendConfirmationCommandValidator()
        {
            RuleFor(x => x.Email)
                .NotEmpty()
                .EmailAddress()
                .MaximumLength(254);
        }
    }
}

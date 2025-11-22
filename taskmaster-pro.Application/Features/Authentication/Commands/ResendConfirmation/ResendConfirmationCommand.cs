namespace taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation
{
    public class ResendConfirmationCommand : IRequest<ResendConfirmationResult>
    {
        public string Email { get; set; } = default!;
    }

    public class ResendConfirmationResult
    {
        public string Email { get; set; } = default!;
        public string? UserId { get; set; }
        public string Token { get; set; } = string.Empty;
        // If true and Token == string.Empty => already confirmed
        public bool AlreadyConfirmed { get; set; } = false;
    }
}

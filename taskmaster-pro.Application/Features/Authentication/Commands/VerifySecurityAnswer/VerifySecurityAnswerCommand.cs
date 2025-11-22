namespace taskmaster_pro.Application.Features.Authentication.Commands.VerifySecurityAnswer
{
    public class VerifySecurityAnswerCommand : IRequest<VerifySecurityAnswerResult>
    {
        public string Email { get; set; } = default!;
        public string SecurityAnswer { get; set; } = default!;
        public string? SessionToken { get; set; }
    }

    public class VerifySecurityAnswerResult
    {
        public bool Succeeded { get; set; }
        public string? ResetToken { get; set; }
        public double? LockoutWaitMinutes { get; set; }
        public IList<string>? Errors { get; set; } = new List<string>();
        public string? Code { get; set; }
    }
}

namespace taskmaster_pro.Application.Features.Authentication.Commands.ResendConfirmation
{
    public class ResendConfirmationHandler : IRequestHandler<ResendConfirmationCommand, ResendConfirmationResult>
    {
        private readonly IAuthenticationService _authService;

        public ResendConfirmationHandler(IAuthenticationService authService)
        {
            _authService = authService;
        }

        public async Task<ResendConfirmationResult> Handle(ResendConfirmationCommand request, CancellationToken cancellationToken)
        {
            return await _authService.ResendConfirmationAsync(request);
        }
    }
}

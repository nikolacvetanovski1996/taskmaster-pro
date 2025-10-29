using taskmaster_pro.Application.Interfaces;

namespace Features.Schedules.Commands.CreateSchedule
{
    public class CreateScheduleCommandHandler : IRequestHandler<CreateScheduleCommand, Guid>
    {
        private readonly IScheduleRepositoryAsync _scheduleRepository;
        private readonly ICurrentUserService _currentUserService;
        private readonly IUserService _userService;

        public CreateScheduleCommandHandler(
            IScheduleRepositoryAsync scheduleRepository,
            ICurrentUserService currentUserService,
            IUserService userService
            )
        {
            _scheduleRepository = scheduleRepository;
            _currentUserService = currentUserService;
            _userService = userService;
        }

        public async Task<Guid> Handle(CreateScheduleCommand request, CancellationToken cancellationToken)
        {
            var currentUserId = _currentUserService.UserId;
            var isAdmin = string.Equals(_currentUserService.GetUserRole(), "Admin", StringComparison.OrdinalIgnoreCase);

            // RBAC: non-admins cannot assign schedules to other users
            if (!string.IsNullOrWhiteSpace(request.AssignedToId) && request.AssignedToId != currentUserId && !isAdmin)
            {
                // Replace ForbiddenException with your project's preferred exception for 403 (or use NotFoundException to hide resource existence)
                throw new ForbiddenException("Only admins may assign schedules to other users.");
            }

            // Default behavior: non-admins -> assigned to themselves if nothing provided
            var assignedToId = request.AssignedToId;
            if (string.IsNullOrWhiteSpace(assignedToId))
            {
                if (isAdmin)
                    throw new BadRequestException("AssignedToId is required for admins.");
                assignedToId = currentUserId;
            }

            var schedule = new Schedule
            {
                Id = Guid.NewGuid(),
                OrderId = request.OrderId,
                Title = request.Title,
                ScheduledStart = request.ScheduledStart,
                ScheduledEnd = request.ScheduledEnd,
                AssignedToId = assignedToId,
                Description = request.Description,
                UserId = _currentUserService.UserId,
                Created = DateTime.UtcNow,
                CreatedBy = _currentUserService.UserId
            };

            await _scheduleRepository.AddAsync(schedule);

            // FAKE EMAIL FOR PORTFOLIO
            if (!string.IsNullOrWhiteSpace(schedule.AssignedToId))
            {
                var assignedUser = await _userService.GetUserByIdAsync(Guid.Parse(schedule.AssignedToId));
                if (assignedUser != null)
                {
                    // In a real-world application, an actual email would be sent here. 
                    // For my portfolio/demo purposes, I only log the intended sending to the console.
                    Console.WriteLine($"[Portfolio] Email would be sent to {assignedUser.Email} with schedule: {schedule.Title}, start: {schedule.ScheduledStart}, end: {schedule.ScheduledEnd}");
                }
            }

            return schedule.Id;
        }
    }
}

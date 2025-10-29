namespace taskmaster_pro.Application.Features.Admin.Queries.GetPagedUsers
{
    public class GetPagedUsersQueryValidator : AbstractValidator<GetPagedUsersQuery>
    {
        public GetPagedUsersQueryValidator()
        {
            // Basic paging params
            RuleFor(x => x.Draw)
                .GreaterThanOrEqualTo(1)
                .WithMessage("Draw must be at least 1.");

            RuleFor(x => x.Start)
                .GreaterThanOrEqualTo(0)
                .WithMessage("Start must be >= 0.");

            RuleFor(x => x.Length)
                .GreaterThan(0)
                .WithMessage("Length (page size) must be > 0.");

            // Columns must be supplied
            RuleFor(x => x.Columns)
                .NotNull()
                .Must(c => c.Any())
                .WithMessage("Columns must be provided.");

            // Every column must have a name (Data)
            RuleForEach(x => x.Columns)
                .ChildRules(column =>
                {
                    column.RuleFor(c => c.Data)
                          .NotEmpty()
                          .WithMessage("Column name is required.");
                });

            // Validate Order array: ensure column indexes are within bounds and dir is correct
            // Entire list is validated so indexes are checked against Columns.Count
            RuleFor(x => x.Order)
                .Must((request, orderList) =>
                {
                    if (orderList == null || !orderList.Any()) return true;

                    // If columns are missing, validator above will already fail.
                    var colCount = request.Columns?.Count ?? 0;
                    if (colCount == 0) return false;

                    // every order entry must reference a valid column index and have a valid dir
                    return orderList.All(o =>
                        o.Column >= 0 &&
                        o.Column < colCount &&
                        (string.IsNullOrEmpty(o.Dir) || o.Dir.Equals("asc", System.StringComparison.OrdinalIgnoreCase) || o.Dir.Equals("desc", System.StringComparison.OrdinalIgnoreCase))
                    );
                })
                .WithMessage("Order entries must reference a valid column index and have dir 'asc', 'desc' or empty.");
        }
    }
}

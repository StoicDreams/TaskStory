namespace StoicDreams.WebApp.DataTypes;

public class SubscriptionPlan
{
	[JsonPropertyName("key")]
	public string Key { get; set; } = string.Empty;
	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;
	[JsonPropertyName("monthlyCharge")]
	public decimal MonthlyCharge { get; set; }
	[JsonPropertyName("monthlyChargePerUser")]
	public decimal MonthlyChargePerUser { get; set; }
	[JsonPropertyName("description")]
	public string Description { get; set; } = string.Empty;
	[JsonPropertyName("teamSize")]
	public int TeamSize { get; set; }
	[JsonPropertyName("projects")]
	public int Projects { get; set; }
	[JsonPropertyName("features")]
	public int Features { get; set; }
	[JsonPropertyName("stories")]
	public int Stories { get; set; }
	[JsonPropertyName("problems")]
	public int Problems { get; set; }
	[JsonPropertyName("solutionsPerProblem")]
	public int SolutionsPerProblem { get; set; }
	[JsonPropertyName("tasksPerUser")]
	public int TasksPerUser { get; set; }
	[JsonPropertyName("status")]
	public string Status { get; set; } = "Planned - Coming Soon";
	[JsonPropertyName("externalPurchaseLink")]
	public string ExternalPurchaseLink { get; set; } = string.Empty;
	[JsonPropertyName("storyRetentionDays")]
	public int StoryRetentionDays { get; set; } = 30;
}

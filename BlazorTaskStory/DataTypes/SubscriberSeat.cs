namespace StoicDreams.WebApp.DataTypes;

public class SubscriberSeat
{
	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;
	[JsonPropertyName("email")]
	public string Email { get; set; } = string.Empty;
	[JsonPropertyName("isActive")]
	public bool IsActive { get; set; }
	[JsonPropertyName("isRemoveable")]
	public bool IsRemoveable { get; set; }
}

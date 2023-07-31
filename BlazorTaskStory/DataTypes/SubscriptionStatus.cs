namespace StoicDreams.WebApp.DataTypes;

public class SubscriptionStatus
{
	[JsonPropertyName("id")]
	public Guid Id { get; set; } = Guid.Empty;
	[JsonPropertyName("name")]
	public string Name { get; set; } = string.Empty;
	[JsonPropertyName("isActive")]
	public bool IsActive { get; set; }
	[JsonPropertyName("subscriptionId")]
	public string SubscriptionId { get; set; } = string.Empty;
	[JsonPropertyName("currentKey")]
	public string CurrentKey { get; set; } = string.Empty;
	[JsonPropertyName("currentExpiration")]
	public DateTime CurrentExpiration { get; set; }
	[JsonPropertyName("renewalEnabled")]
	public bool RenewalEnabled { get; set; }
	[JsonPropertyName("currentSeats")]
	public int CurrentSeats { get; set; }

	public override string ToString() => $"{CurrentKey}.{SubscriptionId}.{RenewalEnabled}.{CurrentSeats}.{CurrentExpiration}";
	public override bool Equals(object? obj)
	{
		if (obj is string text && text == ToString()) { return true; }
		if (obj is SubscriptionStatus status && status.ToString() == ToString()) { return true; }
		return false;
	}
	public override int GetHashCode()
	{
		return ToString().GetHashCode();
	}
}

namespace StoicDreams.WebApp.DataTypes.TaggedItems;

public class FeatureDetail : BaseTaggedItem
{
	public string Summary { get; set; } = string.Empty;
	public string Who { get; set; } = string.Empty;
	public string What { get; set; } = string.Empty;
	public string Where { get; set; } = string.Empty;
	public string When { get; set; } = string.Empty;
	public string Why { get; set; } = string.Empty;
	public string How { get; set; } = string.Empty;
	public Guid Owner { get; set; } = Guid.Empty;

	public override bool NeedsContent => string.IsNullOrWhiteSpace(Summary);

	public override string GetMarkdown => $@"{base.GetMarkdown}

## Summary

{Summary}

## Who

{Who}

## What

{What}

## Where

{Where}

## When

{When}

## Why

{Why}

## How

{How}

".Trim();

	public override string ToString()
	{
		return $"{base.ToString()}_{Summary.GetStaticHashCode()}_{Who.GetStaticHashCode()}_{What.GetStaticHashCode()}_{Where.GetStaticHashCode}_{When.GetStaticHashCode()}_{Why.GetStaticHashCode()}_{How.GetStaticHashCode()}_{Owner}";
	}
}
